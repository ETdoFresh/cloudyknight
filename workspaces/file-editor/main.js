class FileEditor {
    constructor() {
        this.workspaces = [];
        this.currentWorkspace = null;
        this.fileTree = {};
        this.currentFile = null;
        this.currentFilePath = null;
        this.originalContent = '';
        this.isModified = false;
        this.serverUrl = '';
        this.expandedNodes = new Set();
        this.settings = this.loadSettings();
        this.autoSaveInterval = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoStackSize = 100;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadWorkspaces();
        this.loadTheme();
        this.setupSplitter();
        this.applySettings();
        this.updateLineNumbers();
        this.updateEditorInfo();
        this.restoreState();
    }

    setupEventListeners() {
        // Workspace selector
        document.getElementById('workspaceSelector').addEventListener('change', (e) => this.selectWorkspace(e.target.value));
        
        // Tree buttons
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshTree());
        document.getElementById('collapseAllBtn').addEventListener('click', () => this.collapseAll());
        
        // Editor buttons
        document.getElementById('saveBtn').addEventListener('click', () => this.saveFile());
        document.getElementById('findBtn').addEventListener('click', () => this.toggleFindPanel());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        
        // Toolbar buttons
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('cutBtn').addEventListener('click', () => this.cut());
        document.getElementById('copyBtn').addEventListener('click', () => this.copy());
        document.getElementById('pasteBtn').addEventListener('click', () => this.paste());
        document.getElementById('lineNumbersBtn').addEventListener('click', () => this.toggleLineNumbers());
        document.getElementById('wordWrapBtn').addEventListener('click', () => this.toggleWordWrap());
        
        // Editor content
        const editor = document.getElementById('editorContent');
        editor.addEventListener('input', () => this.handleInput());
        editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
        editor.addEventListener('scroll', () => this.syncLineNumbers());
        editor.addEventListener('selectionchange', () => this.updateEditorInfo());
        editor.addEventListener('click', () => this.updateEditorInfo());
        
        // Find panel
        document.getElementById('closeFindBtn').addEventListener('click', () => this.closeFindPanel());
        document.getElementById('findInput').addEventListener('input', () => this.find());
        document.getElementById('findNextBtn').addEventListener('click', () => this.findNext());
        document.getElementById('findPrevBtn').addEventListener('click', () => this.findPrev());
        document.getElementById('replaceBtn').addEventListener('click', () => this.replace());
        document.getElementById('replaceAllBtn').addEventListener('click', () => this.replaceAll());
        
        // Settings modal
        document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeSettings());
        document.getElementById('settingsOverlay').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('fontSizeSlider').addEventListener('input', (e) => this.updateFontSizeLabel(e.target.value));
        
        // Mobile menu
        document.getElementById('hamburgerBtn').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('mobileMenuOverlay').addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('mobileCloseBtn').addEventListener('click', () => this.closeMobileMenu());
        
        // Theme toggle
        document.querySelector('.theme-toggle').addEventListener('click', () => this.toggleTheme());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e));
        
        // Window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Before unload warning
        window.addEventListener('beforeunload', (e) => {
            if (this.isModified) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    setupSplitter() {
        const splitter = document.getElementById('splitter');
        const treePanel = document.getElementById('fileTreePanel');
        let isResizing = false;

        splitter.addEventListener('mousedown', (e) => {
            isResizing = true;
            splitter.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const containerRect = document.querySelector('.main-container').getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            
            if (newWidth > 150 && newWidth < window.innerWidth - 200) {
                treePanel.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                splitter.classList.remove('dragging');
                document.body.style.cursor = '';
            }
        });
    }

    async loadWorkspaces() {
        try {
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces`);
            if (!response.ok) {
                console.error('Failed to fetch workspaces:', response.status, response.statusText);
                throw new Error('Failed to fetch workspaces');
            }
            
            const data = await response.json();
            // Handle both array and object with workspaces property
            this.workspaces = Array.isArray(data) ? data : (data.workspaces || []);
            this.populateWorkspaceSelector();
            
            // Restore saved workspace if available
            const savedState = this.getSavedState();
            if (savedState && savedState.workspaceSlug) {
                const selector = document.getElementById('workspaceSelector');
                selector.value = savedState.workspaceSlug;
                await this.selectWorkspace(savedState.workspaceSlug);
                
                // If there was a saved file, try to open it
                if (savedState.filePath && savedState.fileName) {
                    // Wait for tree to render, then open the file
                    setTimeout(() => {
                        this.openSavedFile(savedState.filePath, savedState.fileName);
                    }, 500);
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
            option.value = workspace.slug;
            option.textContent = workspace.name;
            selector.appendChild(option);
        });
    }

    async selectWorkspace(workspaceSlug) {
        if (!workspaceSlug) {
            this.currentWorkspace = null;
            this.fileTree = {};
            this.showEmptyTree();
            this.saveState();
            return;
        }
        
        this.currentWorkspace = this.workspaces.find(w => w.slug === workspaceSlug);
        await this.loadFileTree();
        this.saveState();
    }

    async loadFileTree() {
        if (!this.currentWorkspace) return;
        
        this.showLoading(true);
        
        try {
            // Use command execution API to list files with type markers
            // BusyBox find doesn't support -printf, so we use a while loop
            // List node_modules and .git as directories but don't recurse into them
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `(find . -maxdepth 1 -type d \\( -name node_modules -o -name .git \\) | while IFS= read -r item; do echo "d:$item:large"; done) && (find . -path ./node_modules -prune -o -path ./.git -prune -o -print | while IFS= read -r item; do if [ -d "$item" ]; then echo "d:$item"; elif [ -f "$item" ]; then echo "f:$item"; fi; done) | head -2000`,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to load file tree');
            
            const result = await response.json();
            const files = result.result.stdout.split('\n').filter(f => f && f !== 'd:.');
            
            console.log('Raw file list:', files.slice(0, 20)); // Debug first 20 items
            
            // Build tree structure from file paths with type information
            this.buildFileTreeFromTypedPaths(files);
            this.renderTree();
        } catch (error) {
            console.error('Error loading file tree:', error);
            this.showToast('Failed to load files', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    buildFileTreeFromTypedPaths(typedPaths) {
        this.fileTree = {};
        const directorySet = new Set();
        const fileSet = new Set();
        const largeDirectories = new Set();
        
        // First, separate directories, files, and large directories
        typedPaths.forEach(typedPath => {
            if (!typedPath) return;
            const parts = typedPath.split(':');
            const type = parts[0];
            const path = parts[1];
            const isLarge = parts[2] === 'large';
            
            if (!path) return;
            const cleanPath = path.replace(/^\.\//, '');
            
            if (type === 'd') {
                directorySet.add(cleanPath);
                if (isLarge) {
                    largeDirectories.add(cleanPath);
                }
            } else if (type === 'f') {
                fileSet.add(cleanPath);
            }
        });
        
        // Build tree structure
        [...directorySet, ...fileSet].forEach(path => {
            const parts = path.split('/');
            let current = this.fileTree;
            
            parts.forEach((part, index) => {
                if (!current[part]) {
                    const fullPath = parts.slice(0, index + 1).join('/');
                    const isDir = directorySet.has(fullPath) || index < parts.length - 1;
                    const isLarge = largeDirectories.has(fullPath);
                    
                    current[part] = {
                        name: part,
                        path: fullPath,
                        isDirectory: isDir,
                        isLargeDirectory: isLarge,
                        children: {}
                    };
                }
                if (index < parts.length - 1) {
                    if (!current[part].children) {
                        current[part].children = {};
                    }
                    current = current[part].children;
                }
            });
        });
    }

    buildFileTreeFromPaths(paths) {
        // Keep old method for compatibility
        this.fileTree = {};
        
        paths.forEach(path => {
            // Remove leading ./ if present
            path = path.replace(/^\.\//, '');
            const parts = path.split('/');
            let current = this.fileTree;
            
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = {
                        name: part,
                        path: parts.slice(0, index + 1).join('/'),
                        isDirectory: index < parts.length - 1 || paths.includes(path + '/'),
                        children: {}
                    };
                }
                if (index < parts.length - 1) {
                    current = current[part].children;
                }
            });
        });
    }

    renderTree() {
        const container = document.getElementById('treeContainer');
        container.innerHTML = this.renderTreeNode(this.fileTree);
    }

    renderTreeNode(node, level = 0) {
        let html = '';
        const sortedKeys = Object.keys(node).sort((a, b) => {
            // Directories first, then files
            if (node[a].isDirectory && !node[b].isDirectory) return -1;
            if (!node[a].isDirectory && node[b].isDirectory) return 1;
            return a.localeCompare(b);
        });

        for (const key of sortedKeys) {
            const item = node[key];
            const isExpanded = this.expandedNodes.has(item.path);
            
            if (item.isDirectory) {
                html += `
                    <div class="tree-item directory ${isExpanded ? 'expanded' : ''}" style="padding-left: ${level * 20}px">
                        <span class="tree-toggle" data-path="${item.path}">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                        <span class="tree-icon">📁</span>
                        <span class="tree-label">${item.name}</span>
                    </div>
                `;
                
                if (isExpanded) {
                    if (item.isLargeDirectory) {
                        // Show message for large directories like node_modules
                        html += `
                            <div class="tree-item large-dir-message" style="padding-left: ${(level + 1) * 20}px">
                                <span class="tree-icon">ℹ️</span>
                                <span class="tree-label" style="font-style: italic; opacity: 0.7;">
                                    Contents not shown due to size
                                </span>
                            </div>
                        `;
                    } else if (item.children && Object.keys(item.children).length > 0) {
                        html += this.renderTreeNode(item.children, level + 1);
                    } else {
                        // Empty directory
                        html += `
                            <div class="tree-item empty-dir-message" style="padding-left: ${(level + 1) * 20}px">
                                <span class="tree-label" style="font-style: italic; opacity: 0.5;">
                                    (empty)
                                </span>
                            </div>
                        `;
                    }
                }
            } else {
                const icon = this.getFileIcon(item.name);
                html += `
                    <div class="tree-item file" style="padding-left: ${level * 20 + 20}px" 
                         data-path="${item.path}" data-name="${item.name}">
                        <span class="tree-icon">${icon}</span>
                        <span class="tree-label">${item.name}</span>
                    </div>
                `;
            }
        }

        return html;
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'js': '📜', 'ts': '📜', 'jsx': '⚛️', 'tsx': '⚛️',
            'html': '🌐', 'css': '🎨', 'scss': '🎨', 'sass': '🎨',
            'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋',
            'md': '📝', 'txt': '📄', 'log': '📄',
            'py': '🐍', 'java': '☕', 'c': '🔧', 'cpp': '🔧',
            'go': '🐹', 'rs': '🦀', 'php': '🐘',
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'zip': '📦', 'tar': '📦', 'gz': '📦',
            'pdf': '📕', 'doc': '📘', 'docx': '📘'
        };
        return iconMap[ext] || '📄';
    }

    async openFile(filePath, fileName) {
        this.showLoading(true);
        
        try {
            const fileExt = fileName.split('.').pop().toLowerCase();
            const isBinary = ['exe', 'bin', 'dll', 'so', 'dylib', 'zip', 'tar', 'gz', 'rar', '7z', 'pdf'].includes(fileExt);
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'ico', 'webp'].includes(fileExt);
            
            if (isBinary) {
                // Handle binary/executable files
                const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `stat -c "%s" "${filePath}" 2>/dev/null || echo "0"`,
                        cwd: '.'
                    })
                });
                
                const result = await response.json();
                const fileSize = parseInt(result.result.stdout.trim()) || 0;
                
                this.showBinaryFile(fileName, fileSize, filePath);
                this.markFileAsSelected(filePath);
            } else if (isImage) {
                // Handle image files - get base64 content
                const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `base64 "${filePath}"`,
                        cwd: '.'
                    })
                });
                
                const result = await response.json();
                const base64 = result.result.stdout.replace(/\n/g, '');
                const mimeType = this.getMimeType(fileExt);
                const dataUrl = `data:${mimeType};base64,${base64}`;
                
                this.showImageFile(fileName, dataUrl);
                this.markFileAsSelected(filePath);
            } else {
                // Handle text files
                const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `cat "${filePath}"`,
                        cwd: '.'
                    })
                });
                
                if (!response.ok) throw new Error('Failed to load file');
                
                const result = await response.json();
                const content = result.result.stdout;
                
                // Restore editor if it was replaced by binary/image view
                let editor = document.getElementById('editorContent');
                if (!editor) {
                    // Restore the editor HTML structure
                    const container = document.getElementById('editorContainer');
                    container.innerHTML = `
                        <div class="line-numbers" id="lineNumbers"></div>
                        <div class="editor-wrapper">
                            <textarea class="editor-content" id="editorContent" 
                                placeholder="Open a file to start editing..." 
                                spellcheck="false"></textarea>
                        </div>
                    `;
                    editor = document.getElementById('editorContent');
                    
                    // Re-attach event listeners
                    editor.addEventListener('input', () => this.handleInput());
                    editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
                    editor.addEventListener('scroll', () => this.syncLineNumbers());
                    editor.addEventListener('selectionchange', () => this.updateEditorInfo());
                    editor.addEventListener('click', () => this.updateEditorInfo());
                }
                
                // Enable editor and set content
                editor.disabled = false;
                editor.value = content;
                
                // Store file info
                this.currentFile = fileName;
                this.currentFilePath = filePath;
                this.originalContent = content;
                this.isModified = false;
                
                // Update UI
                this.updateFileStatus();
                this.updateLineNumbers();
                this.updateEditorInfo();
                this.enableEditorButtons();
                this.markFileAsSelected(filePath);
                
                // Update undo/redo stacks
                this.undoStack = [];
                this.redoStack = [];
                this.updateUndoRedoButtons();
                
                // Save state
                this.saveState();
            }
        } catch (error) {
            console.error('Error opening file:', error);
            this.showToast('Failed to open file', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    getMimeType(ext) {
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'svg': 'image/svg+xml',
            'ico': 'image/x-icon',
            'webp': 'image/webp'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    showBinaryFile(fileName, fileSize, filePath) {
        const editor = document.getElementById('editorContent');
        editor.disabled = true;
        
        // Create a download link using command API to get base64 content
        const downloadHandler = async () => {
            try {
                this.showLoading(true);
                const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: `base64 "${filePath}"`,
                        cwd: '.'
                    })
                });
                
                const result = await response.json();
                const base64 = result.result.stdout.replace(/\n/g, '');
                
                // Convert base64 to blob
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes]);
                
                // Create download link
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error downloading file:', error);
                this.showToast('Failed to download file', 'error');
            } finally {
                this.showLoading(false);
            }
        };
        
        // Create binary file view
        const container = document.getElementById('editorContainer');
        container.innerHTML = `
            <div class="binary-file-view">
                <div class="binary-file-info">
                    <div class="binary-icon">📦</div>
                    <h3>${fileName}</h3>
                    <p>Binary file</p>
                    <p class="file-size">${this.formatFileSize(fileSize)}</p>
                </div>
                <div class="binary-file-actions">
                    <button class="download-btn" id="downloadBinaryBtn">
                        ⬇️ Download File
                    </button>
                </div>
            </div>
        `;
        
        // Add download handler
        document.getElementById('downloadBinaryBtn').addEventListener('click', downloadHandler);
        
        this.currentFile = fileName;
        this.currentFilePath = filePath;
        this.isModified = false;
        this.updateFileStatus('binary');
    }

    showImageFile(fileName, dataUrl) {
        const editor = document.getElementById('editorContent');
        editor.disabled = true;
        
        const container = document.getElementById('editorContainer');
        container.innerHTML = `
            <div class="image-file-view">
                <div class="image-container">
                    <img src="${dataUrl}" alt="${fileName}" />
                </div>
                <div class="image-info">
                    <h3>${fileName}</h3>
                </div>
            </div>
        `;
        
        this.currentFile = fileName;
        this.currentFilePath = null;
        this.isModified = false;
        this.updateFileStatus('image');
    }

    async saveFile() {
        if (!this.currentFilePath || !this.isModified) return;
        
        this.showLoading(true);
        
        try {
            const content = document.getElementById('editorContent').value;
            
            // Create a temporary file and then move it
            const tempFile = `/tmp/editor_save_${Date.now()}.tmp`;
            
            // Encode content as base64 to avoid shell escaping issues
            const base64Content = btoa(unescape(encodeURIComponent(content)));
            
            // Write content using base64 decoding
            const url = `${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`;
            const payload = {
                command: `echo '${base64Content}' | base64 -d > "${this.currentFilePath}"`,
                cwd: '.'
            };
            
            console.log('Saving file to:', url);
            console.log('Payload:', payload);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                console.error('Save failed:', response.status, response.statusText);
                const text = await response.text();
                console.error('Response body:', text);
                throw new Error('Failed to save file');
            }
            
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            
            this.originalContent = content;
            this.isModified = false;
            this.updateFileStatus();
            this.showToast('File saved successfully', 'success');
        } catch (error) {
            console.error('Error saving file:', error);
            this.showToast('Failed to save file', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    handleInput() {
        const editor = document.getElementById('editorContent');
        this.isModified = editor.value !== this.originalContent;
        this.updateFileStatus();
        this.updateLineNumbers();
        this.updateEditorInfo();
        
        // Add to undo stack
        if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== editor.value) {
            this.undoStack.push(editor.value);
            if (this.undoStack.length > this.maxUndoStackSize) {
                this.undoStack.shift();
            }
            this.redoStack = [];
            this.updateUndoRedoButtons();
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('workspace-theme');
        const isDarkMode = savedTheme === 'dark' || 
            (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-theme', !isDarkMode);
        this.updateThemeIcon(isDarkMode);
    }

    toggleTheme() {
        const isDarkMode = !document.body.classList.contains('dark-mode');
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-theme', !isDarkMode);
        localStorage.setItem('workspace-theme', isDarkMode ? 'dark' : 'light');
        this.updateThemeIcon(isDarkMode);
    }

    updateThemeIcon(isDarkMode) {
        const icon = document.querySelector('.theme-icon');
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }

    // Additional helper methods continue...
    updateFileStatus(type = 'text') {
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        if (!this.currentFile) {
            statusIcon.className = 'status-icon';
            statusText.textContent = 'No file open';
        } else if (type === 'binary') {
            statusIcon.className = 'status-icon binary';
            statusText.textContent = `${this.currentFile} (Binary)`;
        } else if (type === 'image') {
            statusIcon.className = 'status-icon image';
            statusText.textContent = `${this.currentFile} (Image)`;
        } else if (this.isModified) {
            statusIcon.className = 'status-icon modified';
            statusText.textContent = `${this.currentFile} (Modified)`;
        } else {
            statusIcon.className = 'status-icon saved';
            statusText.textContent = this.currentFile;
        }
        
        // Update save button
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = !this.isModified || type !== 'text';
    }

    updateLineNumbers() {
        const editor = document.getElementById('editorContent');
        const lineNumbers = document.getElementById('lineNumbers');
        const lines = editor.value.split('\n').length;
        
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<div class="line-number">${i}</div>`;
        }
        lineNumbers.innerHTML = html;
    }

    updateEditorInfo() {
        const editor = document.getElementById('editorContent');
        const lines = editor.value.substr(0, editor.selectionStart).split('\n');
        const currentLine = lines.length;
        const currentColumn = lines[lines.length - 1].length + 1;
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        
        document.getElementById('lineInfo').textContent = `Ln ${currentLine}, Col ${currentColumn}`;
        document.getElementById('selectionInfo').textContent = `${selectedText.length} selected`;
    }

    syncLineNumbers() {
        const editor = document.getElementById('editorContent');
        const lineNumbers = document.getElementById('lineNumbers');
        lineNumbers.scrollTop = editor.scrollTop;
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // State management
    saveState() {
        const state = {
            workspaceSlug: this.currentWorkspace?.slug,
            filePath: this.currentFilePath,
            fileName: this.currentFile
        };
        localStorage.setItem('fileEditorState', JSON.stringify(state));
    }

    getSavedState() {
        try {
            return JSON.parse(localStorage.getItem('fileEditorState'));
        } catch {
            return null;
        }
    }

    restoreState() {
        // State restoration happens in loadWorkspaces
    }

    loadSettings() {
        const defaults = {
            autoSave: false,
            fontSize: 14,
            tabSize: 4,
            showInvisibles: false,
            highlightCurrentLine: true,
            lineNumbers: true,
            wordWrap: false
        };
        
        try {
            const saved = JSON.parse(localStorage.getItem('fileEditorSettings'));
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    }

    saveSettings() {
        this.settings.autoSave = document.getElementById('autoSaveToggle').checked;
        this.settings.fontSize = parseInt(document.getElementById('fontSizeSlider').value);
        this.settings.tabSize = parseInt(document.getElementById('tabSizeSelect').value);
        this.settings.showInvisibles = document.getElementById('showInvisiblesToggle').checked;
        this.settings.highlightCurrentLine = document.getElementById('highlightCurrentLineToggle').checked;
        
        localStorage.setItem('fileEditorSettings', JSON.stringify(this.settings));
        this.applySettings();
        this.closeSettings();
        this.showToast('Settings saved', 'success');
    }

    applySettings() {
        const editor = document.getElementById('editorContent');
        editor.style.fontSize = `${this.settings.fontSize}px`;
        editor.style.tabSize = this.settings.tabSize;
        
        document.getElementById('lineNumbers').style.display = this.settings.lineNumbers ? 'block' : 'none';
        editor.style.wordWrap = this.settings.wordWrap ? 'break-word' : 'normal';
        
        // Setup auto-save
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        if (this.settings.autoSave) {
            this.autoSaveInterval = setInterval(() => {
                if (this.isModified) {
                    this.saveFile();
                }
            }, 30000); // 30 seconds
        }
    }

    // Remaining UI methods
    openSettings() {
        document.getElementById('autoSaveToggle').checked = this.settings.autoSave;
        document.getElementById('fontSizeSlider').value = this.settings.fontSize;
        document.getElementById('fontSizeValue').textContent = `${this.settings.fontSize}px`;
        document.getElementById('tabSizeSelect').value = this.settings.tabSize;
        document.getElementById('showInvisiblesToggle').checked = this.settings.showInvisibles;
        document.getElementById('highlightCurrentLineToggle').checked = this.settings.highlightCurrentLine;
        
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    updateFontSizeLabel(value) {
        document.getElementById('fontSizeValue').textContent = `${value}px`;
    }

    // Simple implementations for remaining methods
    toggleFindPanel() {
        document.getElementById('findPanel').classList.toggle('hidden');
        if (!document.getElementById('findPanel').classList.contains('hidden')) {
            document.getElementById('findInput').focus();
        }
    }

    closeFindPanel() {
        document.getElementById('findPanel').classList.add('hidden');
    }

    find() {
        // Implement find functionality
    }

    findNext() {
        // Implement find next
    }

    findPrev() {
        // Implement find previous
    }

    replace() {
        // Implement replace
    }

    replaceAll() {
        // Implement replace all
    }

    undo() {
        if (this.undoStack.length > 1) {
            const current = this.undoStack.pop();
            this.redoStack.push(current);
            const previous = this.undoStack[this.undoStack.length - 1];
            document.getElementById('editorContent').value = previous;
            this.handleInput();
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop();
            this.undoStack.push(next);
            document.getElementById('editorContent').value = next;
            this.handleInput();
        }
    }

    updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = this.undoStack.length <= 1;
        document.getElementById('redoBtn').disabled = this.redoStack.length === 0;
    }

    cut() {
        document.execCommand('cut');
    }

    copy() {
        document.execCommand('copy');
    }

    paste() {
        document.execCommand('paste');
    }

    toggleLineNumbers() {
        this.settings.lineNumbers = !this.settings.lineNumbers;
        this.applySettings();
        document.getElementById('lineNumbersBtn').classList.toggle('active');
    }

    toggleWordWrap() {
        this.settings.wordWrap = !this.settings.wordWrap;
        this.applySettings();
        document.getElementById('wordWrapBtn').classList.toggle('active');
    }

    enableEditorButtons() {
        document.getElementById('cutBtn').disabled = false;
        document.getElementById('copyBtn').disabled = false;
        document.getElementById('pasteBtn').disabled = false;
    }

    markFileAsSelected(filePath) {
        // Remove previous selection
        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to current file
        const fileElement = document.querySelector(`.tree-item.file[data-path="${filePath}"]`);
        if (fileElement) {
            fileElement.classList.add('selected');
        }
    }

    refreshTree() {
        this.loadFileTree();
    }

    collapseAll() {
        this.expandedNodes.clear();
        this.renderTree();
    }

    toggleMobileMenu() {
        document.getElementById('fileTreePanel').classList.toggle('mobile-open');
        document.getElementById('mobileMenuOverlay').classList.toggle('active');
    }

    closeMobileMenu() {
        document.getElementById('fileTreePanel').classList.remove('mobile-open');
        document.getElementById('mobileMenuOverlay').classList.remove('active');
    }

    handleResize() {
        // Handle window resize
    }

    handleKeyDown(e) {
        // Handle editor specific key events
        if (e.key === 'Tab') {
            e.preventDefault();
            const spaces = ' '.repeat(this.settings.tabSize);
            document.execCommand('insertText', false, spaces);
        }
    }

    handleGlobalKeyDown(e) {
        // Global keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 's':
                    e.preventDefault();
                    this.saveFile();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFindPanel();
                    break;
                case 'z':
                    e.preventDefault();
                    this.undo();
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;
            }
        }
    }

    showEmptyTree() {
        document.getElementById('treeContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>Select a workspace to view files</p>
            </div>
        `;
    }

    openSavedFile(filePath, fileName) {
        // Try to find and click the file in the tree
        const fileElement = document.querySelector(`.tree-item.file[data-path="${filePath}"]`);
        if (fileElement) {
            fileElement.click();
        }
    }
}

// Initialize the file editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const editor = new FileEditor();
    
    // Setup click handlers for tree items after editor is initialized
    document.getElementById('treeContainer').addEventListener('click', (e) => {
        // Check if we clicked on a tree item or its children
        const treeItem = e.target.closest('.tree-item');
        if (!treeItem) return;
        
        if (treeItem.classList.contains('directory')) {
            // Get the path from the toggle element
            const toggle = treeItem.querySelector('.tree-toggle');
            if (toggle) {
                const path = toggle.dataset.path;
                // Toggle expanded state
                if (editor.expandedNodes.has(path)) {
                    editor.expandedNodes.delete(path);
                } else {
                    editor.expandedNodes.add(path);
                }
                // Re-render the tree
                editor.renderTree();
            }
        } else if (treeItem.classList.contains('file')) {
            const path = treeItem.dataset.path;
            const name = treeItem.dataset.name;
            if (path && name) {
                editor.openFile(path, name);
            }
        }
    });
});