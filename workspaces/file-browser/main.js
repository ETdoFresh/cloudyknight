class FileBrowser {
    constructor() {
        this.workspaces = [];
        this.currentWorkspace = null;
        this.currentPath = '';
        this.files = [];
        this.selectedFile = null;
        this.serverUrl = '';
        this.commandHistory = [];
        this.historyIndex = -1;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkServerConnection();
        this.loadWorkspaces();
        this.loadTheme();
        this.restoreState();
    }

    setupEventListeners() {
        // Save state before leaving the page
        window.addEventListener('beforeunload', () => this.saveState());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Workspace selector
        document.getElementById('workspaceSelector').addEventListener('change', (e) => this.selectWorkspace(e.target.value));
        
        // Toolbar buttons
        document.getElementById('refreshFiles').addEventListener('click', () => this.loadFiles());
        document.getElementById('createFolder').addEventListener('click', () => this.openCreateModal('folder'));
        document.getElementById('createFile').addEventListener('click', () => this.openCreateModal('file'));
        document.getElementById('uploadFile').addEventListener('click', () => this.triggerFileUpload());
        
        // Search
        document.getElementById('fileSearch').addEventListener('input', (e) => this.filterFiles(e.target.value));
        
        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleView(e.target.closest('.view-btn')));
        });
        
        // Create modal
        document.getElementById('closeCreateModal').addEventListener('click', () => this.closeCreateModal());
        document.getElementById('cancelCreate').addEventListener('click', () => this.closeCreateModal());
        document.getElementById('createForm').addEventListener('submit', (e) => this.handleCreate(e));
        
        // File modal
        document.getElementById('closeFileModal').addEventListener('click', () => this.closeFileModal());
        document.getElementById('closeFileModalBtn').addEventListener('click', () => this.closeFileModal());
        document.getElementById('openFile').addEventListener('click', (e) => this.viewFile(e));
        document.getElementById('downloadFile').addEventListener('click', () => this.downloadFile());
        document.getElementById('renameFile').addEventListener('click', () => this.openRenameModal());
        document.getElementById('deleteFile').addEventListener('click', () => this.confirmDelete());
        
        // Rename modal
        document.getElementById('closeRenameModal').addEventListener('click', () => this.closeRenameModal());
        document.getElementById('cancelRename').addEventListener('click', () => this.closeRenameModal());
        document.getElementById('renameForm').addEventListener('submit', (e) => this.handleRename(e));
        
        // Confirmation modal
        document.getElementById('confirmCancel').addEventListener('click', () => this.closeConfirmModal());
        
        // File input
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Modal overlays
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => this.closeAllModals());
        });
        
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        
        // Command palette button
        const terminalBtn = document.getElementById('openTerminal');
        if (terminalBtn) {
            terminalBtn.addEventListener('click', () => this.openCommandPalette());
        }
    }

    async checkServerConnection() {
        const statusEl = document.getElementById('serverStatus');
        const urlEl = document.getElementById('serverUrl');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces`);
            if (response.ok) {
                statusEl.className = 'status-indicator connected';
                urlEl.textContent = 'Connected';
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            statusEl.className = 'status-indicator disconnected';
            urlEl.textContent = 'Disconnected';
        }
    }

    async loadWorkspaces() {
        try {
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces`);
            if (!response.ok) throw new Error('Failed to fetch workspaces');
            
            const data = await response.json();
            // Handle both array and object with workspaces property
            this.workspaces = Array.isArray(data) ? data : (data.workspaces || []);
            this.populateWorkspaceSelector();
            
            // Restore saved workspace if available
            const savedState = this.getSavedState();
            if (savedState && savedState.workspaceId) {
                const selector = document.getElementById('workspaceSelector');
                selector.value = savedState.workspaceId;
                await this.selectWorkspace(savedState.workspaceId, savedState.path);
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
            option.value = workspace.id;
            option.textContent = workspace.name;
            selector.appendChild(option);
        });
    }

    async selectWorkspace(workspaceId, restorePath = '') {
        if (!workspaceId) {
            this.currentWorkspace = null;
            this.currentPath = '';
            this.files = [];
            this.showEmptyState();
            this.disableControls();
            this.updateBreadcrumb(); // Reset the breadcrumb
            this.resetStats(); // Reset the header stats
            this.saveState();
            return;
        }
        
        this.currentWorkspace = this.workspaces.find(w => w.id === workspaceId);
        this.currentPath = restorePath || '';
        this.enableControls();
        await this.loadFiles(this.currentPath);
        this.saveState();
    }

    async loadFiles(path = '') {
        if (!this.currentWorkspace) return;
        
        const container = document.getElementById('filesContainer');
        const spinner = document.getElementById('loadingSpinner');
        const emptyState = document.getElementById('emptyState');
        
        // Show loading
        spinner.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        // Clear ALL existing content properly
        container.querySelectorAll('.file-item, .folder-item, .list-item, .empty-folder').forEach(el => el.remove());
        
        try {
            // Use command execution API with ls command to get file listing
            const fullPath = path || '.';
            console.log('Loading files from path:', fullPath);
            
            // Use ls with -la flag to get detailed file information (BusyBox compatible)
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `ls -la "${fullPath}" | tail -n +2`,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to fetch files');
            
            const data = await response.json();
            console.log('Command response:', data);
            
            // Parse ls output into file objects
            this.files = this.parseLsOutput(data.result.stdout);
            // Store the current path
            this.currentPath = path;
            
            // Update breadcrumb
            this.updateBreadcrumb();
            
            // Update stats
            this.updateStats();
            
            // Hide spinner
            spinner.classList.add('hidden');
            
            // Render files
            this.renderFiles();
            
            // Save state after successful load
            this.saveState();
            
            // Restore selection if available
            this.restoreSelection();
            
        } catch (error) {
            console.error('Error loading files:', error);
            spinner.classList.add('hidden');
            this.showToast('Failed to load files', 'error');
        }
    }

    renderFiles() {
        const container = document.getElementById('filesContainer');
        const isGridView = container.classList.contains('grid-view');
        
        // Clear ALL existing items including empty messages
        container.querySelectorAll('.file-item, .folder-item, .list-item, .empty-folder, .empty-folder-inline').forEach(el => el.remove());
        
        // Check if we have files (or if we're in a subdirectory, even if empty)
        if ((!this.files || this.files.length === 0) && !this.currentPath) {
            container.classList.remove('has-content');
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-folder';
            emptyMsg.innerHTML = `
                <div class="empty-icon">📂</div>
                <p>This folder is empty</p>
            `;
            container.appendChild(emptyMsg);
            return;
        }
        
        // Add has-content class when we have files or parent directory
        container.classList.add('has-content');
        
        // Create files array with parent directory if needed
        let filesToRender = [];
        
        // Add parent directory (..) if we're in a subdirectory
        if (this.currentPath) {
            const parentDir = {
                name: '..',
                isDirectory: true,
                isParent: true,
                size: 0,
                updatedAt: null
            };
            filesToRender.push(parentDir);
        }
        
        // Sort files: folders first, then files
        const sorted = [...this.files].sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        
        filesToRender = filesToRender.concat(sorted);
        
        // Check if we only have parent directory and no actual files
        if (filesToRender.length === 1 && filesToRender[0].isParent) {
            // Still show parent directory but also show empty message
            if (isGridView) {
                const card = this.createFileCard(filesToRender[0]);
                card.dataset.fileIndex = 0;
                container.appendChild(card);
            } else {
                const item = this.createFileListItem(filesToRender[0]);
                item.dataset.fileIndex = 0;
                container.appendChild(item);
            }
            
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-folder-inline';
            emptyMsg.innerHTML = `
                <div class="empty-icon">📂</div>
                <p>This folder is empty</p>
            `;
            container.appendChild(emptyMsg);
            return;
        }
        
        filesToRender.forEach((file, index) => {
            if (isGridView) {
                const card = this.createFileCard(file);
                card.dataset.fileIndex = index;
                container.appendChild(card);
            } else {
                const item = this.createFileListItem(file);
                item.dataset.fileIndex = index;
                container.appendChild(item);
            }
        });
        
        // Auto-select the first item if nothing is selected
        if (!this.selectedFile && filesToRender.length > 0) {
            const firstItem = isGridView ? 
                container.querySelector('.folder-item, .file-item') :
                container.querySelector('.list-item');
            
            if (firstItem) {
                const fileIndex = parseInt(firstItem.dataset.fileIndex);
                const firstFile = filesToRender[fileIndex];
                if (firstFile) {
                    this.selectItem(firstItem, firstFile);
                }
            }
        }
    }

    createFileCard(file) {
        const card = document.createElement('div');
        card.className = file.isDirectory ? 'folder-item' : 'file-item';
        card.dataset.path = file.name;  // Use name, not path
        card.dataset.name = file.name;
        
        const icon = this.getFileIcon(file);
        const size = file.isDirectory ? '--' : this.formatFileSize(file.size);
        
        card.innerHTML = `
            <div class="item-icon">${icon}</div>
            <div class="item-name">${this.escapeHtml(file.name)}</div>
            <div class="item-info">
                <span class="item-size">${size}</span>
            </div>
        `;
        
        if (file.isDirectory) {
            if (file.isParent) {
                // Parent directory - navigate up
                card.addEventListener('dblclick', () => this.navigateToParent());
                card.addEventListener('click', (e) => {
                    if (e.detail === 1) {
                        this.selectItem(card, file);
                    }
                });
            } else {
                card.addEventListener('dblclick', () => this.navigateToFolder(file.name));
                card.addEventListener('click', (e) => {
                    if (e.detail === 1) {
                        this.selectItem(card, file);
                    }
                });
            }
        } else {
            card.addEventListener('dblclick', () => this.openFileModal(file));
            card.addEventListener('click', () => this.selectItem(card, file));
        }
        
        // Right-click menu and long-press - not for parent directory
        if (!file.isParent) {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openFileModal(file);
            });
            
            // Add long-press support
            // DISABLED: Touch-and-hold interferes with native mobile browser gestures (text selection, context menus)
            // Uncomment to re-enable if needed in the future
            // this.addLongPressHandler(card, () => this.openFileModal(file));
        }
        
        return card;
    }

    createFileListItem(file) {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.path = file.name;
        item.dataset.name = file.name;
        
        const icon = this.getFileIcon(file);
        const size = file.isDirectory ? '--' : this.formatFileSize(file.size);
        const modified = file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : '--';
        
        item.innerHTML = `
            <div class="list-item-icon">${icon}</div>
            <div class="list-item-name">${this.escapeHtml(file.name)}</div>
            <div class="list-item-modified">${modified}</div>
            <div class="list-item-size">${size}</div>
            <div class="list-item-actions">
                ${file.isParent ? '' : '<button class="action-btn" title="Options">⋮</button>'}
            </div>
        `;
        
        if (file.isDirectory) {
            if (file.isParent) {
                item.addEventListener('dblclick', () => this.navigateToParent());
            } else {
                item.addEventListener('dblclick', () => this.navigateToFolder(file.name));
            }
        } else {
            item.addEventListener('dblclick', () => this.openFileModal(file));
        }
        
        const actionBtn = item.querySelector('.action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFileModal(file);
            });
        }
        
        item.addEventListener('click', () => this.selectItem(item, file));
        
        // Add long-press support for non-parent items
        // DISABLED: Touch-and-hold interferes with native mobile browser gestures (text selection, context menus)
        // Uncomment to re-enable if needed in the future
        // if (!file.isParent) {
        //     this.addLongPressHandler(item, () => this.openFileModal(file));
        // }
        
        return item;
    }

    selectItem(element, file) {
        // Remove previous selection from all possible item types
        document.querySelectorAll('.file-item.selected, .folder-item.selected, .list-item.selected, .selected')
            .forEach(el => el.classList.remove('selected'));
        
        // Add selection
        element.classList.add('selected');
        this.selectedFile = file;
        
        // Save the selection to localStorage
        this.saveState();
    }

    navigateToFolder(folderName) {
        // Build the new path
        const newPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
        console.log('Navigating to folder:', folderName, 'New path:', newPath);
        this.loadFiles(newPath);
        // State will be saved after loadFiles completes
    }
    
    navigateToParent() {
        // Navigate to parent directory
        if (!this.currentPath) return; // Already at root
        
        const segments = this.currentPath.split('/');
        segments.pop(); // Remove last segment
        const parentPath = segments.join('/');
        
        console.log('Navigating to parent, new path:', parentPath || 'root');
        this.loadFiles(parentPath);
        // State will be saved after loadFiles completes
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        // Home
        const home = document.createElement('span');
        home.className = this.currentWorkspace ? 'breadcrumb-item clickable' : 'breadcrumb-item';
        home.innerHTML = `
            <span class="breadcrumb-icon">🏠</span>
            <span class="breadcrumb-text">${this.currentWorkspace?.name || 'Home'}</span>
        `;
        if (this.currentWorkspace) {
            home.addEventListener('click', () => this.loadFiles(''));
        }
        breadcrumb.appendChild(home);
        
        // Path segments
        if (this.currentPath) {
            const segments = this.currentPath.split('/');
            let accumulatedPath = '';
            
            segments.forEach((segment, index) => {
                // Add separator
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '/';
                breadcrumb.appendChild(separator);
                
                // Add segment
                accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
                const item = document.createElement('span');
                item.className = 'breadcrumb-item clickable';
                item.innerHTML = `<span class="breadcrumb-text">${segment}</span>`;
                
                const pathToLoad = accumulatedPath;
                item.addEventListener('click', () => this.loadFiles(pathToLoad));
                breadcrumb.appendChild(item);
            });
        }
    }

    updateStats() {
        let fileCount = 0;
        let folderCount = 0;
        let totalSize = 0;
        
        this.files.forEach(file => {
            if (file.isDirectory) {
                folderCount++;
            } else {
                fileCount++;
                totalSize += file.size || 0;
            }
        });
        
        document.getElementById('totalFiles').textContent = fileCount;
        document.getElementById('totalFolders').textContent = folderCount;
        document.getElementById('totalSize').textContent = this.formatFileSize(totalSize);
    }

    openCreateModal(type) {
        const modal = document.getElementById('createModal');
        const title = document.getElementById('createModalTitle');
        const contentGroup = document.getElementById('fileContentGroup');
        
        title.textContent = type === 'folder' ? 'Create New Folder' : 'Create New File';
        contentGroup.style.display = type === 'folder' ? 'none' : 'block';
        
        document.getElementById('itemName').value = '';
        document.getElementById('fileContent').value = '';
        
        modal.classList.remove('hidden');
        document.getElementById('itemName').focus();
        
        this.createType = type;
    }

    closeCreateModal() {
        document.getElementById('createModal').classList.add('hidden');
    }

    async handleCreate(e) {
        e.preventDefault();
        
        const name = document.getElementById('itemName').value;
        const content = document.getElementById('fileContent').value;
        
        if (!name) return;
        
        const path = this.currentPath ? `${this.currentPath}/${name}` : name;
        
        try {
            let command;
            if (this.createType === 'folder') {
                // Create folder with mkdir
                command = `mkdir -p "${path}"`;
            } else {
                // Create file with echo or touch
                if (content) {
                    // Escape content for shell
                    const escapedContent = content.replace(/'/g, "'\\''");
                    command = `echo '${escapedContent}' > "${path}"`;
                } else {
                    command = `touch "${path}"`;
                }
            }
            
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to create item');
            
            this.showToast(`${this.createType === 'folder' ? 'Folder' : 'File'} created successfully`, 'success');
            this.closeCreateModal();
            this.loadFiles(this.currentPath);
            
        } catch (error) {
            console.error('Error creating item:', error);
            this.showToast(`Failed to create ${this.createType}`, 'error');
        }
    }

    openFileModal(file) {
        this.selectedFile = file;
        const modal = document.getElementById('fileModal');
        
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileIcon').textContent = this.getFileIcon(file);
        document.getElementById('fileType').textContent = file.isDirectory ? 'Folder' : this.getFileExtension(file.name) || 'File';
        document.getElementById('fileSize').textContent = file.isDirectory ? '--' : this.formatFileSize(file.size);
        document.getElementById('fileModified').textContent = file.updatedAt ? new Date(file.updatedAt).toLocaleString() : '--';
        document.getElementById('filePath').textContent = this.currentPath ? `${this.currentPath}/${file.name}` : file.name;
        
        // Show/hide actions based on file type
        document.getElementById('openFile').style.display = file.isDirectory ? 'none' : 'flex';
        document.getElementById('downloadFile').style.display = file.isDirectory ? 'none' : 'flex';
        
        modal.classList.remove('hidden');
    }

    closeFileModal() {
        document.getElementById('fileModal').classList.add('hidden');
    }

    async viewFile(event) {
        if (!this.selectedFile || this.selectedFile.isDirectory) return;
        
        // Build the file path
        const filePath = this.currentPath ? `${this.currentPath}/${this.selectedFile.name}` : this.selectedFile.name;
        
        // Store the current workspace and file path in sessionStorage for the File Viewer to use
        sessionStorage.setItem('fileViewerWorkspace', this.currentWorkspace.id);
        sessionStorage.setItem('fileViewerPath', filePath);
        sessionStorage.setItem('fileViewerFileName', this.selectedFile.name);
        
        // Check if user wants to open in a new tab (Ctrl/Cmd + Click)
        if (event && (event.ctrlKey || event.metaKey || event.shiftKey)) {
            // Open in new tab
            window.open('/file-viewer.html', '_blank');
        } else {
            // Open in same window
            window.location.href = '/file-viewer.html';
        }
    }

    async downloadFile() {
        if (!this.selectedFile || this.selectedFile.isDirectory) return;
        
        try {
            const filePath = this.currentPath ? `${this.currentPath}/${this.selectedFile.name}` : this.selectedFile.name;
            
            // Use command execution API to get file content
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `cat "${filePath}"`,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to download file');
            
            const data = await response.json();
            if (!data.result.success) throw new Error(data.result.error || 'Failed to read file');
            
            // Create blob from the file content
            const blob = new Blob([data.result.stdout], { type: 'application/octet-stream' });
            
            // Create a blob URL and trigger download
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = this.selectedFile.name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up the blob URL
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
            
            this.showToast('File downloaded successfully', 'success');
            this.closeFileModal();
            
        } catch (error) {
            console.error('Error downloading file:', error);
            this.showToast('Failed to download file', 'error');
        }
    }

    openRenameModal() {
        if (!this.selectedFile) return;
        
        const modal = document.getElementById('renameModal');
        document.getElementById('newName').value = this.selectedFile.name;
        modal.classList.remove('hidden');
        document.getElementById('newName').select();
    }

    closeRenameModal() {
        document.getElementById('renameModal').classList.add('hidden');
    }

    async handleRename(e) {
        e.preventDefault();
        
        const newName = document.getElementById('newName').value;
        if (!newName || newName === this.selectedFile.name) return;
        
        const oldPath = this.currentPath ? `${this.currentPath}/${this.selectedFile.name}` : this.selectedFile.name;
        const newPath = this.currentPath ? `${this.currentPath}/${newName}` : newName;
        
        try {
            // Use mv command to rename/move file
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `mv "${oldPath}" "${newPath}"`,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to rename item');
            
            this.showToast('Item renamed successfully', 'success');
            this.closeRenameModal();
            this.closeFileModal();
            this.loadFiles(this.currentPath);
            
        } catch (error) {
            console.error('Error renaming item:', error);
            this.showToast('Failed to rename item', 'error');
        }
    }

    confirmDelete() {
        if (!this.selectedFile) return;
        
        const modal = document.getElementById('confirmModal');
        const message = document.getElementById('confirmMessage');
        
        message.textContent = `Are you sure you want to delete "${this.selectedFile.name}"?`;
        
        // Setup confirm action
        const confirmBtn = document.getElementById('confirmAction');
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        document.getElementById('confirmAction').addEventListener('click', () => this.deleteFile());
        
        modal.classList.remove('hidden');
    }

    async deleteFile() {
        if (!this.selectedFile) return;
        
        try {
            const filePath = this.currentPath ? `${this.currentPath}/${this.selectedFile.name}` : this.selectedFile.name;
            
            // Use rm command for files, rm -rf for directories
            const command = this.selectedFile.isDirectory ? 
                `rm -rf "${filePath}"` : 
                `rm -f "${filePath}"`;
            
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to delete item');
            
            this.showToast('Item deleted successfully', 'success');
            this.closeConfirmModal();
            this.closeFileModal();
            this.loadFiles(this.currentPath);
            
        } catch (error) {
            console.error('Error deleting item:', error);
            this.showToast('Failed to delete item', 'error');
        }
    }

    closeConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
    }

    triggerFileUpload() {
        document.getElementById('fileInput').click();
    }

    async handleFileUpload(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        
        for (const file of files) {
            await this.uploadFile(file);
        }
        
        // Clear the input
        e.target.value = '';
        this.loadFiles(this.currentPath);
    }

    async uploadFile(file) {
        try {
            const reader = new FileReader();
            
            // Check if this is a binary file based on MIME type or extension
            const isBinary = this.isBinaryFile(file.name) || 
                            (file.type && !file.type.startsWith('text/'));
            
            const content = await new Promise((resolve, reject) => {
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                
                if (isBinary) {
                    // For binary files, read as base64
                    reader.readAsDataURL(file);
                } else {
                    // For text files, read as text
                    reader.readAsText(file);
                }
            });
            
            const path = this.currentPath ? `${this.currentPath}/${file.name}` : file.name;
            
            let command;
            if (isBinary && content.startsWith('data:')) {
                // For binary files, use base64 decoding
                const base64Content = content.split(',')[1];
                command = `echo '${base64Content}' | base64 -d > "${path}"`;
            } else {
                // For text files, escape content and write directly
                const escapedContent = content.replace(/'/g, "'\\''");
                command = `cat > "${path}" << 'EOF'\n${escapedContent}\nEOF`;
            }
            
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    cwd: '.'
                })
            });
            
            if (!response.ok) throw new Error('Failed to upload file');
            
            this.showToast(`Uploaded ${file.name}`, 'success');
            
        } catch (error) {
            console.error('Error uploading file:', error);
            this.showToast(`Failed to upload ${file.name}`, 'error');
        }
    }

    filterFiles(searchTerm) {
        const items = document.querySelectorAll('.file-item, .folder-item, .list-item');
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const name = item.dataset.name?.toLowerCase() || '';
            // Always show parent directory (..)
            if (name === '..') {
                item.style.display = '';
            } else {
                item.style.display = name.includes(term) ? '' : 'none';
            }
        });
    }

    toggleView(btn) {
        if (btn.classList.contains('active')) return;
        
        // Remember the currently selected file before changing views
        const selectedFileName = this.selectedFile?.name || null;
        
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const container = document.getElementById('filesContainer');
        const isGrid = btn.dataset.view === 'grid';
        const hasContent = container.classList.contains('has-content');
        
        container.className = `files-container ${isGrid ? 'grid-view' : 'list-view'}${hasContent ? ' has-content' : ''}`;
        this.renderFiles();
        
        // Restore selection after rendering
        if (selectedFileName) {
            // Find and select the previously selected file
            const items = isGrid ? 
                Array.from(container.querySelectorAll('.folder-item, .file-item')) :
                Array.from(container.querySelectorAll('.list-item'));
            
            // Build the files array the same way as in renderFiles
            let filesToRender = [];
            if (this.currentPath) {
                const parentDir = {
                    name: '..',
                    isDirectory: true,
                    isParent: true,
                    size: 0,
                    lastModified: new Date()
                };
                filesToRender.push(parentDir);
            }
            
            const sorted = [...this.files].sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
            
            filesToRender = filesToRender.concat(sorted);
            
            // Find the item with the matching file name
            for (let i = 0; i < items.length; i++) {
                const fileIndex = parseInt(items[i].dataset.fileIndex);
                const file = filesToRender[fileIndex];
                if (file && file.name === selectedFileName) {
                    this.selectItem(items[i], file);
                    break;
                }
            }
        } else {
            // If nothing was selected before, select the first item
            const firstItem = isGrid ? 
                container.querySelector('.folder-item, .file-item') :
                container.querySelector('.list-item');
            
            if (firstItem) {
                // Build the files array to get the first file
                let filesToRender = [];
                if (this.currentPath) {
                    const parentDir = {
                        name: '..',
                        isDirectory: true,
                        isParent: true,
                        size: 0,
                        lastModified: new Date()
                    };
                    filesToRender.push(parentDir);
                }
                
                const sorted = [...this.files].sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });
                
                filesToRender = filesToRender.concat(sorted);
                
                const fileIndex = parseInt(firstItem.dataset.fileIndex);
                const firstFile = filesToRender[fileIndex];
                if (firstFile) {
                    this.selectItem(firstItem, firstFile);
                }
            }
        }
        
        // Save view preference
        localStorage.setItem('fileBrowserView', isGrid ? 'grid' : 'list');
    }

    getFileIcon(file) {
        if (file.isParent) return '⬆️'; // Simple up arrow for parent directory
        if (file.isDirectory) return '📁';
        
        const ext = this.getFileExtension(file.name);
        const iconMap = {
            'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
            'html': '🌐', 'css': '🎨', 'scss': '🎨',
            'json': '📋', 'xml': '📄', 'yaml': '📝', 'yml': '📝',
            'md': '📖', 'txt': '📝', 'log': '📊',
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'pdf': '📕', 'doc': '📄', 'docx': '📄',
            'zip': '🗜️', 'tar': '🗜️', 'gz': '🗜️',
            'mp3': '🎵', 'mp4': '🎬', 'avi': '🎬',
            'py': '🐍', 'java': '☕', 'c': '🔧', 'cpp': '🔧',
            'sh': '🖥️', 'bat': '🖥️', 'exe': '⚙️'
        };
        
        return iconMap[ext] || '📄';
    }

    getFileExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    isBinaryFile(filename) {
        const binaryExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
            'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
            'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'wav', 'ogg',
            'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
            'ttf', 'otf', 'woff', 'woff2', 'eot'
        ];
        const ext = filename.split('.').pop()?.toLowerCase();
        return ext ? binaryExtensions.includes(ext) : false;
    }

    updateStats() {
        if (!this.files) {
            this.resetStats();
            return;
        }
        
        let fileCount = 0;
        let folderCount = 0;
        let totalSize = 0;
        
        this.files.forEach(item => {
            if (item.isDirectory) {
                folderCount++;
            } else {
                fileCount++;
                totalSize += item.size || 0;
            }
        });
        
        document.getElementById('totalFiles').textContent = fileCount.toString();
        document.getElementById('totalFolders').textContent = folderCount.toString();
        document.getElementById('totalSize').textContent = this.formatFileSize(totalSize);
    }
    
    resetStats() {
        document.getElementById('totalFiles').textContent = '0';
        document.getElementById('totalFolders').textContent = '0';
        document.getElementById('totalSize').textContent = '0 B';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showEmptyState() {
        const container = document.getElementById('filesContainer');
        const emptyState = document.getElementById('emptyState');
        
        container.classList.remove('has-content');
        // Remove ALL dynamic content including empty-folder messages
        container.querySelectorAll('.file-item, .folder-item, .list-item, .empty-folder').forEach(el => el.remove());
        emptyState.classList.remove('hidden');
    }

    enableControls() {
        document.getElementById('refreshFiles').disabled = false;
        document.getElementById('createFolder').disabled = false;
        document.getElementById('createFile').disabled = false;
        document.getElementById('uploadFile').disabled = false;
        document.getElementById('fileSearch').disabled = false;
        const terminalBtn = document.getElementById('openTerminal');
        if (terminalBtn) terminalBtn.disabled = false;
    }

    disableControls() {
        document.getElementById('refreshFiles').disabled = true;
        document.getElementById('createFolder').disabled = true;
        document.getElementById('createFile').disabled = true;
        document.getElementById('uploadFile').disabled = true;
        document.getElementById('fileSearch').disabled = true;
        const terminalBtn = document.getElementById('openTerminal');
        if (terminalBtn) terminalBtn.disabled = true;
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.toggle('dark-mode');
        const icon = document.querySelector('.theme-icon');
        
        icon.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('workspace-theme', isDark ? 'dark' : 'light');
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('workspace-theme');
        const isDarkMode = savedTheme === 'dark' || 
            (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            document.querySelector('.theme-icon').textContent = '☀️';
        }
        
        // Load saved view preference
        const savedView = localStorage.getItem('fileBrowserView');
        if (savedView === 'list') {
            const listBtn = document.querySelector('.view-btn[data-view="list"]');
            if (listBtn) {
                this.toggleView(listBtn);
            }
        }
    }
    
    saveState() {
        const state = {
            workspaceId: this.currentWorkspace?.id || null,
            path: this.currentPath || '',
            selectedFileName: this.selectedFile?.name || null,
            timestamp: Date.now()
        };
        localStorage.setItem('fileBrowserState', JSON.stringify(state));
    }
    
    getSavedState() {
        try {
            const saved = localStorage.getItem('fileBrowserState');
            if (!saved) return null;
            
            const state = JSON.parse(saved);
            // Only restore state if it's less than 24 hours old
            const dayInMs = 24 * 60 * 60 * 1000;
            if (Date.now() - state.timestamp > dayInMs) {
                localStorage.removeItem('fileBrowserState');
                return null;
            }
            return state;
        } catch (error) {
            console.error('Error parsing saved state:', error);
            return null;
        }
    }
    
    restoreState() {
        // State restoration is handled in loadWorkspaces after workspaces are loaded
        // This method is for any additional state restoration needed
    }
    
    restoreSelection() {
        const savedState = this.getSavedState();
        if (!savedState || !savedState.selectedFileName) return;
        
        // Find and select the previously selected file
        const items = document.querySelectorAll('.file-item, .folder-item, .list-item');
        items.forEach(item => {
            if (item.dataset.name === savedState.selectedFileName) {
                const file = this.files.find(f => f.name === savedState.selectedFileName);
                if (file) {
                    this.selectItem(item, file);
                }
            }
        });
    }

    handleArrowNavigation(key) {
        const container = document.getElementById('filesContainer');
        const isGridView = container.classList.contains('grid-view');
        
        // Get all file items (cards or list items)
        const items = isGridView ? 
            Array.from(container.querySelectorAll('.folder-item, .file-item')) :
            Array.from(container.querySelectorAll('.list-item'));
        
        if (items.length === 0) return;
        
        // Find currently selected item
        const currentIndex = items.findIndex(item => 
            item.classList.contains('selected')
        );
        
        let newIndex = currentIndex;
        
        if (isGridView) {
            // Grid view navigation
            // Calculate grid dimensions
            const containerWidth = container.offsetWidth;
            const itemWidth = items[0].offsetWidth + parseInt(getComputedStyle(items[0]).marginRight) * 2;
            const itemsPerRow = Math.floor(containerWidth / itemWidth) || 1;
            
            switch (key) {
                case 'ArrowUp':
                    newIndex = currentIndex - itemsPerRow;
                    break;
                case 'ArrowDown':
                    newIndex = currentIndex + itemsPerRow;
                    break;
                case 'ArrowLeft':
                    // Don't wrap to previous row at the beginning of a row
                    if (currentIndex % itemsPerRow === 0) {
                        newIndex = currentIndex; // Stay in place
                    } else {
                        newIndex = currentIndex - 1;
                    }
                    break;
                case 'ArrowRight':
                    // Don't wrap to next row at the end of a row
                    if ((currentIndex + 1) % itemsPerRow === 0 || currentIndex === items.length - 1) {
                        newIndex = currentIndex; // Stay in place
                    } else {
                        newIndex = currentIndex + 1;
                    }
                    break;
            }
        } else {
            // List view navigation (simpler)
            switch (key) {
                case 'ArrowUp':
                case 'ArrowLeft':
                    newIndex = currentIndex - 1;
                    break;
                case 'ArrowDown':
                case 'ArrowRight':
                    newIndex = currentIndex + 1;
                    break;
            }
        }
        
        // If no item was selected, start with the first one
        if (currentIndex === -1 && (key === 'ArrowDown' || key === 'ArrowRight')) {
            newIndex = 0;
        }
        
        // Ensure new index is within bounds
        if (newIndex >= 0 && newIndex < items.length) {
            // Build the files array the same way as in renderFiles
            let filesToRender = [];
            
            // Add parent folder if we're in a subfolder
            if (this.currentPath) {
                const parentDir = {
                    name: '..',
                    isDirectory: true,
                    isParent: true,
                    size: 0,
                    lastModified: new Date()
                };
                filesToRender.push(parentDir);
            }
            
            // Sort files: folders first, then files
            const sorted = [...this.files].sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
            
            filesToRender = filesToRender.concat(sorted);
            
            // Get the file at the index
            const fileIndex = parseInt(items[newIndex].dataset.fileIndex);
            const file = filesToRender[fileIndex];
            
            if (file) {
                this.selectItem(items[newIndex], file);
                
                // Scroll the item into view if needed
                items[newIndex].scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest',
                    inline: 'nearest'
                });
            }
        }
    }

    handleKeyboardShortcuts(e) {
        // Only handle shortcuts when not typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Ctrl/Cmd + K - Open command palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.openCommandPalette();
            return;
        }
        
        // Arrow key navigation
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            this.handleArrowNavigation(e.key);
            return;
        }
        
        // Ctrl/Cmd + D - Download selected file
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            if (this.selectedFile && !this.selectedFile.isDirectory) {
                this.downloadFile();
            }
        }
        
        // Ctrl/Cmd + O - Open/View selected file
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            if (this.selectedFile && !this.selectedFile.isDirectory) {
                this.viewFile();
            }
        }
        
        // Delete key - Delete selected file
        if (e.key === 'Delete') {
            e.preventDefault();
            if (this.selectedFile) {
                this.confirmDelete();
            }
        }
        
        // F2 - Rename selected file
        if (e.key === 'F2') {
            e.preventDefault();
            if (this.selectedFile) {
                this.openRenameModal();
            }
        }
        
        // Enter - Open folder or file modal
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this.selectedFile) {
                if (this.selectedFile.isDirectory) {
                    if (this.selectedFile.isParent) {
                        this.navigateToParent();
                    } else {
                        this.navigateToFolder(this.selectedFile.name);
                    }
                } else {
                    this.openFileModal(this.selectedFile);
                }
            }
        }
        
        // Escape - Close any open modal
        if (e.key === 'Escape') {
            this.closeFileModal();
            this.closeCreateModal();
            this.closeRenameModal();
            this.closeConfirmModal();
        }
    }

    parseLsOutput(lsOutput) {
        if (!lsOutput || lsOutput.trim() === '') return [];
        
        const lines = lsOutput.trim().split('\n');
        const files = [];
        
        for (const line of lines) {
            // Parse BusyBox ls -la output format:
            // drwxr-xr-x    2 1000     1000          4096 Jan 20 10:30 dirname
            // -rw-r--r--    1 1000     1000          1234 Jan 20 10:30 filename
            // Note: BusyBox uses spaces for alignment, so we need to be more careful
            
            const match = line.match(/^([drwxlst-]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/);
            if (!match) {
                // Try alternate format for different date styles
                const parts = line.trim().split(/\s+/);
                if (parts.length < 9) continue;
                
                const permissions = parts[0];
                const size = parseInt(parts[4]) || 0;
                // BusyBox date format: "Jan 20 10:30" or "Jan 20  2024"
                const dateTimeParts = parts.slice(5, 8);
                const name = parts.slice(8).join(' ');
                
                // Skip . and .. entries
                if (name === '.' || name === '..') continue;
                
                files.push({
                    name: name,
                    isDirectory: permissions.startsWith('d'),
                    size: size,
                    permissions: permissions,
                    updatedAt: dateTimeParts.join(' ')
                });
            } else {
                const [, permissions, , , , size, dateTime, name] = match;
                
                // Skip . and .. entries
                if (name === '.' || name === '..') continue;
                
                files.push({
                    name: name,
                    isDirectory: permissions.startsWith('d'),
                    size: parseInt(size) || 0,
                    permissions: permissions,
                    updatedAt: dateTime
                });
            }
        }
        
        return files;
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
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
    
    // Command execution methods
    async executeCommand(command) {
        if (!this.currentWorkspace) {
            this.showToast('Please select a workspace first', 'warning');
            return null;
        }
        
        if (!command || command.trim() === '') {
            return null;
        }
        
        // Add to history
        this.commandHistory.push(command);
        if (this.commandHistory.length > 100) {
            this.commandHistory.shift(); // Keep only last 100 commands
        }
        this.historyIndex = this.commandHistory.length;
        
        // Save history to localStorage
        localStorage.setItem('commandHistory', JSON.stringify(this.commandHistory));
        
        try {
            const response = await fetch(`${this.serverUrl}/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: command,
                    cwd: this.currentPath || '.'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Command execution failed');
            }
            
            const data = await response.json();
            
            // Check if command changes directory (cd command)
            if (command.trim().startsWith('cd ')) {
                const newPath = command.trim().substring(3).trim();
                if (newPath === '..') {
                    this.navigateToParent();
                } else if (newPath === '/' || newPath === '~') {
                    this.loadFiles('');
                } else if (newPath.startsWith('/')) {
                    // Absolute path
                    this.loadFiles(newPath.substring(1));
                } else {
                    // Relative path
                    const targetPath = this.currentPath ? `${this.currentPath}/${newPath}` : newPath;
                    this.loadFiles(targetPath);
                }
            }
            
            // Check if command modifies files (mkdir, touch, rm, etc.)
            const fileModifyingCommands = ['mkdir', 'touch', 'rm', 'mv', 'cp', 'delete', 'cat >', 'echo >'];
            if (fileModifyingCommands.some(cmd => command.includes(cmd))) {
                // Refresh file list after a short delay
                setTimeout(() => this.loadFiles(this.currentPath), 500);
            }
            
            return data;
            
        } catch (error) {
            console.error('Command execution error:', error);
            this.showToast(error.message, 'error');
            return {
                result: {
                    success: false,
                    error: error.message,
                    stdout: '',
                    stderr: error.message
                }
            };
        }
    }
    
    openCommandPalette() {
        const modal = document.getElementById('commandModal');
        if (!modal) {
            this.createCommandModal();
        }
        
        document.getElementById('commandModal').classList.remove('hidden');
        document.getElementById('commandInput').focus();
    }
    
    closeCommandModal() {
        const modal = document.getElementById('commandModal');
        if (modal) {
            modal.classList.add('hidden');
            document.getElementById('commandOutput').textContent = '';
            document.getElementById('commandInput').value = '';
        }
    }
    
    createCommandModal() {
        const modalHtml = `
            <div id="commandModal" class="modal hidden">
                <div class="modal-overlay" onclick="fileBrowser.closeCommandModal()"></div>
                <div class="modal-content command-modal">
                    <div class="modal-header">
                        <h2>Command Terminal</h2>
                        <button class="modal-close" id="closeCommandModal">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="command-info">
                            <span class="command-workspace">${this.currentWorkspace?.name || 'No workspace'}</span>
                            <span class="command-separator">:</span>
                            <span class="command-path">/${this.currentPath || ''}</span>
                        </div>
                        <div class="command-output-container">
                            <pre id="commandOutput"></pre>
                        </div>
                        <div class="command-input-container">
                            <span class="command-prompt">$</span>
                            <input type="text" id="commandInput" class="command-input" 
                                   placeholder="Enter command (e.g., ls, grep, find)">
                            <button id="executeCommand" class="btn btn-primary">Run</button>
                        </div>
                        <div class="command-shortcuts">
                            <small>Press Enter to execute • ↑/↓ for history • Esc to close</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Setup event listeners for the command modal
        document.getElementById('closeCommandModal').addEventListener('click', () => this.closeCommandModal());
        document.getElementById('executeCommand').addEventListener('click', () => this.runCommand());
        document.getElementById('commandInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.runCommand();
            } else if (e.key === 'Escape') {
                this.closeCommandModal();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });
        
        // Load command history from localStorage
        const savedHistory = localStorage.getItem('commandHistory');
        if (savedHistory) {
            try {
                this.commandHistory = JSON.parse(savedHistory);
                this.historyIndex = this.commandHistory.length;
            } catch (e) {
                console.error('Failed to load command history:', e);
            }
        }
    }
    
    async runCommand() {
        const input = document.getElementById('commandInput');
        const output = document.getElementById('commandOutput');
        const command = input.value.trim();
        
        if (!command) return;
        
        // Display the command being executed
        output.textContent += `$ ${command}\n`;
        
        // Execute the command
        const result = await this.executeCommand(command);
        
        if (result && result.result) {
            // Display output
            if (result.result.stdout) {
                output.textContent += result.result.stdout;
                if (!result.result.stdout.endsWith('\n')) {
                    output.textContent += '\n';
                }
            }
            
            if (result.result.stderr) {
                output.textContent += `Error: ${result.result.stderr}`;
                if (!result.result.stderr.endsWith('\n')) {
                    output.textContent += '\n';
                }
            }
            
            if (!result.result.success && result.result.error) {
                output.textContent += `Error: ${result.result.error}\n`;
            }
        }
        
        // Clear input
        input.value = '';
        
        // Scroll to bottom
        output.scrollTop = output.scrollHeight;
        
        // Update the path display in case it changed
        document.querySelector('.command-path').textContent = `/${this.currentPath || ''}`;
    }
    
    navigateHistory(direction) {
        const input = document.getElementById('commandInput');
        
        if (direction === -1 && this.historyIndex > 0) {
            this.historyIndex--;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex === this.commandHistory.length - 1) {
            this.historyIndex = this.commandHistory.length;
            input.value = '';
        }
    }
    
    // DISABLED: Touch-and-hold feature commented out because it interferes with native mobile browser gestures
    // such as text selection, context menus, and other built-in touch interactions.
    // The feature can be re-enabled by uncommenting this method and its usage above if needed in the future.
    /*
    addLongPressHandler(element, callback) {
        let pressTimer = null;
        let isLongPress = false;
        
        const startPress = (e) => {
            // Don't trigger on right-click
            if (e.type === 'mousedown' && e.button !== 0) return;
            
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                callback();
                // Prevent the click event after long press
                e.preventDefault();
            }, 500); // 500ms for long press
        };
        
        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };
        
        const handleClick = (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                isLongPress = false;
            }
        };
        
        // Support both touch and mouse events
        element.addEventListener('touchstart', startPress, { passive: false });
        element.addEventListener('mousedown', startPress);
        
        element.addEventListener('touchend', cancelPress);
        element.addEventListener('touchcancel', cancelPress);
        element.addEventListener('mouseup', cancelPress);
        element.addEventListener('mouseleave', cancelPress);
        
        // Prevent click after long press
        element.addEventListener('click', handleClick, { capture: true });
    }
    */
}

// Initialize the file browser
let fileBrowser; // Global reference for modal onclick handlers
document.addEventListener('DOMContentLoaded', () => {
    fileBrowser = new FileBrowser();
});