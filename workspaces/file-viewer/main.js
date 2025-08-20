class FileViewer {
    constructor() {
        this.workspaces = [];
        this.currentWorkspace = null;
        this.fileTree = {};
        this.selectedFile = null;
        this.serverUrl = '';
        this.expandedNodes = new Set();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadWorkspaces();
        this.loadTheme();
        this.setupSplitter();
        this.restoreState();
    }

    setupEventListeners() {
        // Workspace selector
        document.getElementById('workspaceSelector').addEventListener('change', (e) => this.selectWorkspace(e.target.value));
        
        // Buttons
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshTree());
        document.getElementById('collapseAllBtn').addEventListener('click', () => this.collapseAll());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadFile());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyContent());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        
        // Mobile menu toggle
        document.getElementById('hamburgerBtn').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('mobileMenuOverlay').addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('mobileCloseBtn').addEventListener('click', () => this.closeMobileMenu());
        
        // Theme toggle
        document.querySelector('.theme-toggle').addEventListener('click', () => this.toggleTheme());
        
        // Save state before leaving
        window.addEventListener('beforeunload', () => this.saveState());
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    setupSplitter() {
        const splitter = document.getElementById('splitter');
        const treePanel = document.getElementById('fileTreePanel');
        const container = document.querySelector('.main-container');
        let isResizing = false;

        splitter.addEventListener('mousedown', (e) => {
            isResizing = true;
            splitter.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            
            if (newWidth > 200 && newWidth < container.offsetWidth - 200) {
                treePanel.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                splitter.classList.remove('dragging');
                document.body.style.cursor = '';
                this.saveState();
            }
        });
    }

    async loadWorkspaces() {
        try {
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces`);
            if (!response.ok) throw new Error('Failed to fetch workspaces');
            
            const data = await response.json();
            // Handle both array and object with workspaces property
            this.workspaces = Array.isArray(data) ? data : (data.workspaces || []);
            this.populateWorkspaceSelector();
            
            // Check if we came from File Browser with a specific file to open
            const workspaceFromBrowser = sessionStorage.getItem('fileViewerWorkspace');
            const pathFromBrowser = sessionStorage.getItem('fileViewerPath');
            const fileNameFromBrowser = sessionStorage.getItem('fileViewerFileName');
            
            if (workspaceFromBrowser && pathFromBrowser) {
                // Clear the session storage
                sessionStorage.removeItem('fileViewerWorkspace');
                sessionStorage.removeItem('fileViewerPath');
                sessionStorage.removeItem('fileViewerFileName');
                
                // Select the workspace and load the file
                const selector = document.getElementById('workspaceSelector');
                selector.value = workspaceFromBrowser;
                await this.selectWorkspace(workspaceFromBrowser);
                
                // Find and select the file in the tree
                setTimeout(() => {
                    this.selectFileByPath(pathFromBrowser, fileNameFromBrowser);
                }, 500); // Small delay to ensure tree is rendered
            } else {
                // Restore saved workspace if available
                const savedState = this.getSavedState();
                if (savedState && savedState.workspaceId) {
                    const selector = document.getElementById('workspaceSelector');
                    selector.value = savedState.workspaceId;
                    await this.selectWorkspace(savedState.workspaceId);
                    
                    // If there was a selected file, try to restore it
                    if (savedState.selectedFile && !savedState.selectedFile.isDirectory) {
                        // Wait for tree to render, then select the file
                        setTimeout(() => {
                            this.restoreSelectedFile(savedState.selectedFile);
                        }, 500);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading workspaces:', error);
            this.showToast('Failed to load workspaces', 'error');
        }
    }

    populateWorkspaceSelector() {
        const selector = document.getElementById('workspaceSelector');
        selector.innerHTML = '<option value="">Select Workspace...</option>';
        
        this.workspaces.forEach(workspace => {
            const option = document.createElement('option');
            option.value = workspace.id || workspace.slug;
            option.textContent = workspace.name;
            selector.appendChild(option);
        });
    }

    async selectWorkspace(workspaceId) {
        if (!workspaceId) {
            this.currentWorkspace = null;
            this.fileTree = {};
            this.showEmptyTree();
            return;
        }
        
        this.currentWorkspace = this.workspaces.find(w => (w.id === workspaceId) || (w.slug === workspaceId));
        await this.loadFileTree();
        this.saveState();
    }

    async loadFileTree() {
        if (!this.currentWorkspace) return;
        
        this.showLoading(true);
        
        try {
            const workspaceSlug = this.currentWorkspace.slug || this.currentWorkspace.id;
            const files = await this.getFilesRecursive(workspaceSlug, '.');
            this.buildFileTree(files);
            this.renderTree();
        } catch (error) {
            console.error('Error loading file tree:', error);
            this.showToast('Failed to load files', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async getFilesRecursive(workspaceSlug, path) {
        const files = [];
        
        try {
            // Use find command with -printf to get both file path and type in one go
            // This is more efficient than making separate test commands for each file
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${workspaceSlug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `find "${path}" -maxdepth 10 \\( -type f -o -type d \\) -exec sh -c 'if [ -d "$1" ]; then echo "d:$1"; else echo "f:$1"; fi' _ {} \\; | head -500`,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to fetch files');
            
            const data = await response.json();
            const lines = data.result.stdout.split('\n').filter(line => line.trim());
            
            // Convert find output to file objects
            for (const line of lines) {
                if (!line || line === 'd:.') continue;
                
                const [type, filePath] = line.split(':', 2);
                if (!filePath) continue;
                
                const relativePath = filePath.startsWith('./') ? filePath.substring(2) : filePath;
                const parts = relativePath.split('/');
                const name = parts[parts.length - 1];
                const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
                
                files.push({
                    name: name,
                    path: parentPath,
                    isDirectory: type === 'd'
                });
            }
        } catch (error) {
            console.error('Error getting files recursively:', error);
        }
        
        return files;
    }

    buildFileTree(files) {
        this.fileTree = { children: {} };
        
        files.forEach(file => {
            const pathParts = file.path === '/' ? [] : file.path.substring(1).split('/');
            pathParts.push(file.name);
            
            let current = this.fileTree;
            pathParts.forEach((part, index) => {
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        isDirectory: index < pathParts.length - 1 || file.isDirectory,
                        children: {},
                        file: index === pathParts.length - 1 ? file : null
                    };
                }
                current = current.children[part];
            });
        });
    }

    renderTree() {
        const container = document.getElementById('treeContainer');
        container.innerHTML = '';
        
        if (Object.keys(this.fileTree.children).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <p>This workspace is empty</p>
                </div>
            `;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        this.renderTreeNodes(this.fileTree.children, fragment, '');
        container.appendChild(fragment);
    }

    renderTreeNodes(nodes, parent, path) {
        Object.keys(nodes).sort((a, b) => {
            const aIsDir = nodes[a].isDirectory;
            const bIsDir = nodes[b].isDirectory;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        }).forEach(name => {
            const node = nodes[name];
            const fullPath = path ? `${path}/${name}` : name;
            const item = this.createTreeItem(node, fullPath);
            parent.appendChild(item);
        });
    }

    createTreeItem(node, path) {
        const item = document.createElement('div');
        item.className = 'tree-item';
        
        const nodeEl = document.createElement('div');
        nodeEl.className = 'tree-node';
        
        // Create children element first so we can reference it
        let childrenEl = null;
        if (node.isDirectory && Object.keys(node.children).length > 0) {
            childrenEl = document.createElement('div');
            childrenEl.className = `tree-children ${this.expandedNodes.has(path) ? 'expanded' : ''}`;
        }
        
        if (node.isDirectory) {
            const isExpanded = this.expandedNodes.has(path);
            
            const toggle = document.createElement('span');
            toggle.className = `tree-toggle ${isExpanded ? '' : 'collapsed'}`;
            toggle.textContent = '▼';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleNode(path, toggle, childrenEl);
            });
            nodeEl.appendChild(toggle);
            
            nodeEl.addEventListener('click', () => {
                this.toggleNode(path, toggle, childrenEl);
            });
        } else {
            // Add empty space for alignment
            const spacer = document.createElement('span');
            spacer.style.width = '20px';
            spacer.style.display = 'inline-block';
            nodeEl.appendChild(spacer);
            
            nodeEl.addEventListener('click', () => {
                this.selectFile(node.file, nodeEl);
            });
        }
        
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = this.getFileIcon(node);
        nodeEl.appendChild(icon);
        
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.name;
        nodeEl.appendChild(name);
        
        item.appendChild(nodeEl);
        
        // Add children element if it exists
        if (childrenEl) {
            this.renderTreeNodes(node.children, childrenEl, path);
            item.appendChild(childrenEl);
        }
        
        return item;
    }

    toggleNode(path, toggle, childrenEl) {
        if (!childrenEl) return; // No children to toggle
        
        if (this.expandedNodes.has(path)) {
            this.expandedNodes.delete(path);
            toggle.classList.add('collapsed');
            childrenEl.classList.remove('expanded');
        } else {
            this.expandedNodes.add(path);
            toggle.classList.remove('collapsed');
            childrenEl.classList.add('expanded');
        }
        this.saveState();
    }

    async selectFile(file, nodeEl) {
        if (!file || file.isDirectory) return;
        
        // Update selection UI
        document.querySelectorAll('.tree-node.selected').forEach(el => el.classList.remove('selected'));
        nodeEl.classList.add('selected');
        
        this.selectedFile = file;
        
        // Update file info
        document.getElementById('fileIcon').textContent = this.getFileIcon({ name: file.name, isDirectory: false });
        document.getElementById('fileName').textContent = file.name;
        
        // Load and display content
        await this.loadFileContent(file);
        
        // Show action buttons
        document.getElementById('downloadBtn').style.display = '';
        // Show copy button for all file types and update icon based on file type
        const copyBtn = document.getElementById('copyBtn');
        copyBtn.style.display = '';
        // Change icon to link/chain for images, clipboard for text files
        copyBtn.innerHTML = this.isImageFile(file.name) ? '🔗' : '🔗';
        copyBtn.title = this.isImageFile(file.name) ? 'Copy URL' : 'Copy Link';
        document.getElementById('fullscreenBtn').style.display = this.isImageFile(file.name) ? '' : 'none';
        
        // Close mobile menu if open (on mobile devices)
        if (window.innerWidth <= 768) {
            this.closeMobileMenu();
        }
        
        this.saveState();
    }

    async loadFileContent(file) {
        const viewer = document.getElementById('contentViewer');
        viewer.innerHTML = '<div class="loading">Loading...</div>';
        
        try {
            // Construct the file path - handle root directory properly
            let filePath;
            if (file.path === '/' || file.path === '') {
                filePath = file.name;
            } else {
                // Remove leading slash from path if present
                const cleanPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
                filePath = cleanPath ? `${cleanPath}/${file.name}` : file.name;
            }
            
            const workspaceSlug = this.currentWorkspace.slug || this.currentWorkspace.id;
            
            console.log('Loading file:', file);
            console.log('File path:', filePath);
            
            // Check if file is binary/executable
            if (this.isBinaryFile(file.name)) {
                // For binary files, show file info instead of content
                // Get file metadata using stat command
                const statResponse = await fetch(`${this.serverUrl}/api/v1/workspaces/${workspaceSlug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `stat -c "%s %Y" "${filePath}" 2>/dev/null || echo "0 0"`,
                        cwd: '.'
                    })
                });
                
                if (!statResponse.ok) throw new Error('Failed to load file metadata');
                
                const statData = await statResponse.json();
                const [fileSizeStr, modTime] = statData.result.stdout.trim().split(' ');
                const fileSize = parseInt(fileSizeStr) || 0;
                const modifiedDate = modTime !== '0' ? new Date(parseInt(modTime) * 1000).toLocaleString() : 'Unknown';
                
                viewer.innerHTML = `
                    <div class="binary-file-info">
                        <div class="file-icon-large">${this.getFileIcon({ name: file.name })}</div>
                        <h2>${file.name}</h2>
                        <div class="file-metadata">
                            <div class="metadata-item">
                                <span class="metadata-label">Type:</span>
                                <span class="metadata-value">Binary/Executable File</span>
                            </div>
                            <div class="metadata-item">
                                <span class="metadata-label">Size:</span>
                                <span class="metadata-value">${this.formatFileSize(fileSize)}</span>
                            </div>
                            <div class="metadata-item">
                                <span class="metadata-label">Modified:</span>
                                <span class="metadata-value">${modifiedDate}</span>
                            </div>
                            <div class="metadata-item">
                                <span class="metadata-label">Path:</span>
                                <span class="metadata-value">${filePath}</span>
                            </div>
                        </div>
                        <div class="binary-file-actions">
                            <button class="download-btn" id="binaryDownloadBtn">
                                ⬇️ Download File
                            </button>
                        </div>
                        <div class="binary-file-notice">
                            <p>⚠️ This is a binary file and cannot be displayed as text.</p>
                            <p>You can download it to view or execute it locally.</p>
                        </div>
                    </div>
                `;
                
                // Add event listener for download button
                setTimeout(() => {
                    const btn = document.getElementById('binaryDownloadBtn');
                    if (btn) {
                        btn.addEventListener('click', () => this.downloadFile());
                    }
                }, 0);
            } else if (this.isImageFile(file.name)) {
                // For images, we need to fetch the base64 content
                const imgResponse = await fetch(`${this.serverUrl}/api/v1/workspaces/${workspaceSlug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `base64 "${filePath}"`,
                        cwd: '.'
                    })
                });
                
                if (!imgResponse.ok) throw new Error('Failed to load image');
                
                const imgData = await imgResponse.json();
                const base64 = imgData.result.stdout.replace(/\n/g, '');
                const mimeType = this.getImageMimeType(file.name);
                const dataUrl = `data:${mimeType};base64,${base64}`;
                
                viewer.innerHTML = `
                    <div class="image-content">
                        <img src="${dataUrl}" alt="${file.name}" />
                    </div>
                `;
            } else if (this.isAudioFile(file.name)) {
                // For audio files, we can't easily stream them through command API
                viewer.innerHTML = `
                    <div class="audio-content">
                        <div class="audio-icon">🎵</div>
                        <p>${file.name}</p>
                        <p style="color: var(--text-secondary); margin-top: 1rem;">Audio playback not available through command API</p>
                    </div>
                `;
            } else {
                // For text files, use cat command to get content
                const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${workspaceSlug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `cat "${filePath}"`,
                        cwd: '.'
                    })
                });
                
                if (!response.ok) throw new Error('Failed to load file content');
                
                const data = await response.json();
                const content = data.result.stdout;
                
                // Check if it's JSON and format it
                if (file.name.endsWith('.json')) {
                    try {
                        const jsonData = JSON.parse(content);
                        viewer.innerHTML = `
                            <div class="text-content">${this.escapeHtml(JSON.stringify(jsonData, null, 2))}</div>
                        `;
                    } catch {
                        // If JSON parsing fails, show as plain text
                        viewer.innerHTML = `
                            <div class="text-content">${this.escapeHtml(content)}</div>
                        `;
                    }
                } else if (file.name.endsWith('.md')) {
                    // Render markdown using marked library
                    try {
                        const htmlContent = marked.parse(content);
                        viewer.innerHTML = `
                            <div class="markdown-content" data-raw-content="${this.escapeHtml(content)}">${htmlContent}</div>
                        `;
                    } catch (e) {
                        // If markdown parsing fails, show as plain text
                        console.error('Markdown parsing failed:', e);
                        viewer.innerHTML = `
                            <div class="text-content">${this.escapeHtml(content)}</div>
                        `;
                    }
                } else {
                    // For other text files, show as plain text
                    viewer.innerHTML = `
                        <div class="text-content">${this.escapeHtml(content)}</div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error loading file content:', error);
            viewer.innerHTML = `
                <div class="empty-viewer">
                    <div class="empty-icon">⚠️</div>
                    <h3>Error Loading File</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    isTextFile(filename) {
        const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'xml', 'yaml', 'yml', 'ini', 'conf', 'log', 'sh', 'bat', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'go', 'rs', 'vue', 'sql'];
        const ext = filename.split('.').pop().toLowerCase();
        return textExtensions.includes(ext);
    }

    isImageFile(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        const ext = filename.split('.').pop().toLowerCase();
        return imageExtensions.includes(ext);
    }

    isAudioFile(filename) {
        const audioExtensions = ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'flac'];
        const ext = filename.split('.').pop().toLowerCase();
        return audioExtensions.includes(ext);
    }

    isVideoFile(filename) {
        const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', 'mpg', 'mpeg'];
        const ext = filename.split('.').pop().toLowerCase();
        return videoExtensions.includes(ext);
    }

    isBinaryFile(filename) {
        // Check if file is not text, image, audio, or video
        if (this.isTextFile(filename) || this.isImageFile(filename) || 
            this.isAudioFile(filename) || this.isVideoFile(filename)) {
            return false;
        }
        
        // Common binary/executable extensions
        const binaryExtensions = ['exe', 'dll', 'so', 'dylib', 'bin', 'app', 'deb', 
            'rpm', 'dmg', 'pkg', 'msi', 'jar', 'war', 'ear', 'class', 'pyc', 
            'pyo', 'o', 'a', 'lib', 'node', 'wasm', 'dat', 'db', 'sqlite'];
        
        const ext = filename.split('.').pop().toLowerCase();
        
        // Files without extension are often executables
        if (!filename.includes('.')) {
            return true;
        }
        
        // Check against binary extensions
        if (binaryExtensions.includes(ext)) {
            return true;
        }
        
        // Default to binary for unknown extensions
        return !this.isTextFile(filename);
    }

    getAudioMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'webm': 'audio/webm',
            'm4a': 'audio/mp4',
            'flac': 'audio/flac'
        };
        return mimeTypes[ext] || 'audio/mpeg';
    }

    getImageMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp',
            'ico': 'image/x-icon'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileIcon(node) {
        if (node.isDirectory) return '📁';
        
        const name = node.name || node.file?.name || '';
        const ext = name.split('.').pop().toLowerCase();
        
        // Use the same icons as file browser
        const iconMap = {
            'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
            'html': '🌐', 'css': '🎨', 'scss': '🎨',
            'json': '📋', 'xml': '📄', 'yaml': '📝', 'yml': '📝',
            'md': '📖', 'txt': '📝', 'log': '📊',
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'pdf': '📕', 'doc': '📄', 'docx': '📄',
            'zip': '🗜️', 'tar': '🗜️', 'gz': '🗜️',
            'mp3': '🎵', 'mp4': '🎬', 'avi': '🎬', 'wav': '🎵', 'ogg': '🎵',
            'webm': '🎬',
            'py': '🐍', 'java': '☕', 'c': '🔧', 'cpp': '🔧',
            'sh': '🖥️', 'bat': '🖥️', 'exe': '⚙️'
        };
        
        return iconMap[ext] || '📄';
    }

    async downloadFile() {
        if (!this.selectedFile) return;
        
        try {
            const filePath = this.selectedFile.path === '/' ? 
                this.selectedFile.name : 
                `${this.selectedFile.path.substring(1)}/${this.selectedFile.name}`;
            const workspaceSlug = this.currentWorkspace.slug || this.currentWorkspace.id;
            
            // Fetch file content using cat command (for text) or base64 (for binary)
            const isBinary = this.isBinaryFile(this.selectedFile.name) || this.isImageFile(this.selectedFile.name);
            const command = isBinary ? `base64 "${filePath}"` : `cat "${filePath}"`;
            
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${workspaceSlug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to fetch file');
            
            const data = await response.json();
            const content = data.result.stdout;
            
            // Create blob and download
            let blob;
            if (isBinary) {
                // Decode base64 for binary files
                const binaryString = atob(content.replace(/\n/g, ''));
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                blob = new Blob([bytes]);
            } else {
                // Text files
                blob = new Blob([content], { type: 'text/plain' });
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.selectedFile.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('File downloaded successfully', 'success');
        } catch (error) {
            console.error('Error downloading file:', error);
            this.showToast('Failed to download file', 'error');
        }
    }

    async copyContent() {
        if (!this.selectedFile) return;
        
        try {
            // Copy the file path
            const filePath = this.selectedFile.path === '/' ? 
                this.selectedFile.name : 
                `${this.selectedFile.path.substring(1)}/${this.selectedFile.name}`;
            const workspaceSlug = this.currentWorkspace.slug || this.currentWorkspace.id;
            const filePathText = `${workspaceSlug}/${filePath}`;
            
            // Try modern clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(filePathText);
                this.showToast('File path copied to clipboard', 'success');
            } else {
                // Fallback for older browsers or non-HTTPS contexts
                const textarea = document.createElement('textarea');
                textarea.value = filePathText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.showToast('File path copied to clipboard', 'success');
            }
        } catch (error) {
            console.error('Error copying link:', error);
            this.showToast('Failed to copy link', 'error');
        }
    }

    toggleFullscreen() {
        const imageContent = document.querySelector('.image-content img');
        if (!imageContent) return;
        
        if (!document.fullscreenElement) {
            imageContent.requestFullscreen().catch(err => {
                console.error('Error entering fullscreen:', err);
                this.showToast('Failed to enter fullscreen', 'error');
            });
        } else {
            document.exitFullscreen();
        }
    }

    refreshTree() {
        if (this.currentWorkspace) {
            this.loadFileTree();
        }
    }

    collapseAll() {
        this.expandedNodes.clear();
        document.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.classList.add('collapsed');
        });
        document.querySelectorAll('.tree-children').forEach(children => {
            children.classList.remove('expanded');
        });
        this.saveState();
    }

    showEmptyTree() {
        const container = document.getElementById('treeContainer');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>Select a workspace to view files</p>
            </div>
        `;
        
        document.getElementById('contentViewer').innerHTML = `
            <div class="empty-viewer">
                <div class="empty-icon">📄</div>
                <h3>No File Selected</h3>
                <p>Select a file from the tree to view its contents</p>
            </div>
        `;
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    toggleMobileMenu() {
        const treePanel = document.getElementById('fileTreePanel');
        const overlay = document.getElementById('mobileMenuOverlay');
        const isOpen = treePanel.classList.contains('mobile-menu-open');
        
        if (isOpen) {
            this.closeMobileMenu();
        } else {
            treePanel.classList.add('mobile-menu-open');
            overlay.classList.add('active');
            // Prevent body scroll when menu is open
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeMobileMenu() {
        const treePanel = document.getElementById('fileTreePanel');
        const overlay = document.getElementById('mobileMenuOverlay');
        
        treePanel.classList.remove('mobile-menu-open');
        overlay.classList.remove('active');
        // Restore body scroll
        document.body.style.overflow = '';
    }
    
    handleResize() {
        // Close mobile menu when resizing to desktop view
        if (window.innerWidth > 768) {
            this.closeMobileMenu();
        }
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('workspace-theme', isDark ? 'dark' : 'light');
        document.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('workspace-theme');
        const isDarkMode = savedTheme === 'dark' || 
            (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            document.querySelector('.theme-icon').textContent = '☀️';
        }
    }

    saveState() {
        const state = {
            workspaceId: this.currentWorkspace?.id || this.currentWorkspace?.slug || null,
            expandedNodes: Array.from(this.expandedNodes),
            selectedFile: this.selectedFile ? {
                name: this.selectedFile.name,
                path: this.selectedFile.path,
                isDirectory: this.selectedFile.isDirectory
            } : null,
            panelWidth: document.getElementById('fileTreePanel').style.width || '300px',
            timestamp: Date.now()
        };
        localStorage.setItem('fileViewerState', JSON.stringify(state));
    }

    getSavedState() {
        try {
            const saved = localStorage.getItem('fileViewerState');
            if (!saved) return null;
            
            const state = JSON.parse(saved);
            // Only restore state if it's less than 24 hours old
            const dayInMs = 24 * 60 * 60 * 1000;
            if (Date.now() - state.timestamp > dayInMs) {
                localStorage.removeItem('fileViewerState');
                return null;
            }
            return state;
        } catch (error) {
            console.error('Error parsing saved state:', error);
            return null;
        }
    }

    restoreState() {
        const state = this.getSavedState();
        if (!state) return;
        
        if (state.expandedNodes) {
            this.expandedNodes = new Set(state.expandedNodes);
        }
        
        if (state.panelWidth) {
            document.getElementById('fileTreePanel').style.width = state.panelWidth;
        }
    }

    restoreSelectedFile(fileInfo) {
        if (!fileInfo || !this.fileTree) return;
        
        // Construct the full path
        let fullPath;
        if (fileInfo.path === '/' || fileInfo.path === '') {
            fullPath = fileInfo.name;
        } else {
            const cleanPath = fileInfo.path.startsWith('/') ? fileInfo.path.substring(1) : fileInfo.path;
            fullPath = cleanPath ? `${cleanPath}/${fileInfo.name}` : fileInfo.name;
        }
        
        // Use the existing selectFileByPath method
        this.selectFileByPath(fullPath, fileInfo.name);
    }

    selectFileByPath(filePath, fileName) {
        // Find the file in the tree and select it
        const findAndExpandPath = (nodes, pathParts, currentIndex = 0) => {
            if (currentIndex >= pathParts.length) return;
            
            const targetName = pathParts[currentIndex];
            const node = nodes[targetName];
            
            if (!node) return;
            
            // If this is the last part and it's the file we're looking for
            if (currentIndex === pathParts.length - 1) {
                // Find the tree node element and click it
                const allTreeNodes = document.querySelectorAll('.tree-node');
                for (const treeNode of allTreeNodes) {
                    const nameEl = treeNode.querySelector('.tree-name');
                    if (nameEl && nameEl.textContent === targetName) {
                        // Simulate click to select the file
                        treeNode.click();
                        break;
                    }
                }
            } else if (node.isDirectory) {
                // Expand this directory and continue
                const path = pathParts.slice(0, currentIndex + 1).join('/');
                this.expandedNodes.add(path);
                
                // Continue with the next part
                setTimeout(() => {
                    findAndExpandPath(node.children, pathParts, currentIndex + 1);
                }, 100);
            }
        };
        
        // Split the path and start searching
        const pathParts = filePath.split('/').filter(p => p);
        
        // Re-render the tree with expanded nodes
        this.renderTree();
        
        // Start the search
        setTimeout(() => {
            findAndExpandPath(this.fileTree.children, pathParts);
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => container.removeChild(toast), 300);
        }, 3000);
    }
}

// Initialize the file viewer
document.addEventListener('DOMContentLoaded', () => {
    new FileViewer();
});