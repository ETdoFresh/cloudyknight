// Workspace Admin Panel
class WorkspaceAdmin {
    constructor() {
        this.workspaces = this.loadWorkspaces();
        this.currentEditId = null;
        this.initTheme();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderWorkspaces();
        this.updateStatistics();
        this.populateIconPicker();
    }

    // Initialize theme from localStorage or system preference
    initTheme() {
        const savedTheme = localStorage.getItem('admin-theme');
        
        if (savedTheme) {
            // Ensure body has the saved theme class
            document.body.classList.add(savedTheme);
            this.updateThemeIcon(savedTheme === 'dark-theme');
        } else {
            // Use system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.body.classList.add('dark-theme');
                this.updateThemeIcon(true);
            } else {
                document.body.classList.add('light-theme');
                this.updateThemeIcon(false);
            }
        }
    }

    updateThemeIcon(isDark) {
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = isDark ? '☀️' : '🌙';
        }
    }

    // Load workspaces from localStorage (in production, this would be an API call)
    loadWorkspaces() {
        const stored = localStorage.getItem('workspaces');
        if (stored) {
            return JSON.parse(stored);
        }
        
        // Default workspaces
        return [
            {
                id: 'www',
                slug: 'www',
                name: 'www',
                icon: '🌐',
                description: 'Main website and landing pages',
                status: 'active',
                type: 'static',
                created: new Date('2024-01-01').toISOString()
            },
            {
                id: 'admin',
                slug: 'admin',
                name: 'Admin',
                icon: '🔧',
                description: 'Administration panel for workspace management',
                status: 'active',
                type: 'nodejs',
                created: new Date('2024-01-01').toISOString()
            }
        ];
    }

    // Save workspaces to localStorage
    saveWorkspaces() {
        localStorage.setItem('workspaces', JSON.stringify(this.workspaces));
        this.renderWorkspaces();
        this.updateStatistics();
        this.updateMainSiteWorkspaces();
    }

    // Update the main site's workspace display
    updateMainSiteWorkspaces() {
        // In production, this would trigger an API call to update the main site
        console.log('Updating main site workspaces...');
    }

    setupEventListeners() {
        // Modal controls
        document.getElementById('createWorkspaceBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelModal').addEventListener('click', () => this.closeModal());
        
        // Form submission
        document.getElementById('workspaceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveWorkspace();
        });
        
        // Slug input auto-generates path
        document.getElementById('workspaceSlug').addEventListener('input', (e) => {
            const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
            e.target.value = slug;
            document.getElementById('workspacePath').value = slug;
            
            // Check for uniqueness
            if (this.currentEditId !== slug && this.workspaces.find(w => w.slug === slug)) {
                e.target.setCustomValidity('This slug is already in use');
            } else {
                e.target.setCustomValidity('');
            }
        });
        
        // Icon picker
        document.getElementById('iconPickerBtn').addEventListener('click', () => this.openIconPicker());
        document.getElementById('closeIconPicker').addEventListener('click', () => this.closeIconPicker());
        
        // Search and filter
        document.getElementById('workspaceSearch').addEventListener('input', () => this.filterWorkspaces());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterWorkspaces());
        
        // Refresh button
        document.getElementById('refreshList').addEventListener('click', () => {
            this.showToast('Workspaces refreshed', 'success');
            this.renderWorkspaces();
        });
        
        // Export config
        document.getElementById('exportConfig').addEventListener('click', () => this.exportConfig());
        
        // Close modal on overlay click
        document.querySelector('.modal-overlay').addEventListener('click', () => this.closeModal());
        
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    }

    openModal(workspace = null) {
        const modal = document.getElementById('workspaceModal');
        const modalTitle = document.getElementById('modalTitle');
        const deleteBtn = document.getElementById('deleteWorkspace');
        
        if (workspace) {
            // Edit mode
            modalTitle.textContent = 'Edit Workspace';
            this.currentEditId = workspace.id;
            
            document.getElementById('workspaceId').value = workspace.id;
            document.getElementById('workspaceSlug').value = workspace.slug;
            document.getElementById('workspaceIcon').value = workspace.icon;
            document.getElementById('workspaceName').value = workspace.name;
            document.getElementById('workspaceDescription').value = workspace.description;
            document.getElementById('workspaceStatus').value = workspace.status;
            document.getElementById('workspaceType').value = workspace.type || 'static';
            document.getElementById('workspacePath').value = workspace.slug;
            
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => this.confirmDelete(workspace.id);
        } else {
            // Create mode
            modalTitle.textContent = 'Create New Workspace';
            this.currentEditId = null;
            document.getElementById('workspaceForm').reset();
            document.getElementById('workspaceIcon').value = '📁';
            deleteBtn.classList.add('hidden');
        }
        
        modal.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('workspaceModal').classList.add('hidden');
        document.getElementById('workspaceForm').reset();
        this.currentEditId = null;
    }

    saveWorkspace() {
        const formData = {
            slug: document.getElementById('workspaceSlug').value,
            icon: document.getElementById('workspaceIcon').value || '📁',
            name: document.getElementById('workspaceName').value,
            description: document.getElementById('workspaceDescription').value,
            status: document.getElementById('workspaceStatus').value,
            type: document.getElementById('workspaceType').value
        };
        
        if (this.currentEditId) {
            // Update existing workspace
            const index = this.workspaces.findIndex(w => w.id === this.currentEditId);
            if (index !== -1) {
                this.workspaces[index] = {
                    ...this.workspaces[index],
                    ...formData,
                    modified: new Date().toISOString()
                };
                this.showToast(`Workspace "${formData.name}" updated`, 'success');
            }
        } else {
            // Create new workspace
            const newWorkspace = {
                id: formData.slug,
                ...formData,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            };
            this.workspaces.push(newWorkspace);
            this.showToast(`Workspace "${formData.name}" created`, 'success');
            
            // In production, this would also create the actual directory
            console.log(`Creating directory: /workspaces/${formData.slug}`);
        }
        
        this.saveWorkspaces();
        this.closeModal();
    }

    confirmDelete(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        const confirmModal = document.getElementById('confirmModal');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmAction = document.getElementById('confirmAction');
        const confirmCancel = document.getElementById('confirmCancel');
        
        confirmMessage.textContent = `Are you sure you want to delete the workspace "${workspace.name}"? This action cannot be undone.`;
        confirmModal.classList.remove('hidden');
        
        confirmAction.onclick = () => {
            this.deleteWorkspace(id);
            confirmModal.classList.add('hidden');
            this.closeModal();
        };
        
        confirmCancel.onclick = () => {
            confirmModal.classList.add('hidden');
        };
    }

    deleteWorkspace(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        this.workspaces = this.workspaces.filter(w => w.id !== id);
        this.saveWorkspaces();
        this.showToast(`Workspace "${workspace.name}" deleted`, 'success');
        
        // In production, this would also delete the actual directory
        console.log(`Deleting directory: /workspaces/${workspace.slug}`);
    }

    renderWorkspaces() {
        const grid = document.getElementById('workspacesGrid');
        const searchTerm = document.getElementById('workspaceSearch').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        let filtered = this.workspaces;
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(w => 
                w.name.toLowerCase().includes(searchTerm) ||
                w.slug.toLowerCase().includes(searchTerm) ||
                w.description.toLowerCase().includes(searchTerm)
            );
        }
        
        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(w => w.status === statusFilter);
        }
        
        // Sort by name
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        
        grid.innerHTML = filtered.map(workspace => `
            <div class="workspace-admin-card">
                <div class="workspace-admin-header">
                    <div class="workspace-admin-info">
                        <div class="workspace-admin-icon">${workspace.icon}</div>
                        <div class="workspace-admin-name">${workspace.name}</div>
                        <span class="workspace-admin-slug">/${workspace.slug}</span>
                    </div>
                    <span class="workspace-admin-status ${workspace.status}">${workspace.status.replace('-', ' ')}</span>
                </div>
                <div class="workspace-admin-description">
                    ${workspace.description || 'No description provided'}
                </div>
                <div class="workspace-admin-actions">
                    <button class="btn btn-secondary btn-small" onclick="workspaceAdmin.openModal(${JSON.stringify(workspace).replace(/"/g, '&quot;')})">
                        Edit
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="workspaceAdmin.viewWorkspace('${workspace.slug}')">
                        View
                    </button>
                    ${workspace.status === 'active' ? 
                        `<button class="btn btn-warning btn-small" onclick="workspaceAdmin.toggleStatus('${workspace.id}')">Hide</button>` :
                        `<button class="btn btn-success btn-small" onclick="workspaceAdmin.toggleStatus('${workspace.id}')">Activate</button>`
                    }
                </div>
            </div>
        `).join('');
        
        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <p style="font-size: 1.2rem;">No workspaces found</p>
                    <p style="margin-top: 0.5rem;">Try adjusting your search or filters</p>
                </div>
            `;
        }
    }

    filterWorkspaces() {
        this.renderWorkspaces();
    }

    viewWorkspace(slug) {
        window.open(`/${slug}`, '_blank');
    }

    toggleStatus(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        if (workspace) {
            if (workspace.status === 'active') {
                workspace.status = 'hidden';
            } else {
                workspace.status = 'active';
            }
            workspace.modified = new Date().toISOString();
            this.saveWorkspaces();
            this.showToast(`Workspace "${workspace.name}" status updated`, 'success');
        }
    }

    updateStatistics() {
        const total = this.workspaces.length;
        const active = this.workspaces.filter(w => w.status === 'active').length;
        const comingSoon = this.workspaces.filter(w => w.status === 'coming-soon').length;
        const hidden = this.workspaces.filter(w => w.status === 'hidden').length;
        
        document.getElementById('totalWorkspaces').textContent = total;
        document.getElementById('activeWorkspaces').textContent = active;
        document.getElementById('comingSoonWorkspaces').textContent = comingSoon;
        document.getElementById('hiddenWorkspaces').textContent = hidden;
    }

    // Icon Picker
    openIconPicker() {
        document.getElementById('iconPickerModal').classList.remove('hidden');
    }

    closeIconPicker() {
        document.getElementById('iconPickerModal').classList.add('hidden');
    }

    populateIconPicker() {
        const icons = [
            '📁', '🌐', '🔧', '⚡', '📝', '📚', '📊', '🗄️', '💾', '🔍',
            '⚙️', '🚀', '💻', '🎨', '📱', '🔒', '🔑', '📧', '📞', '📍',
            '🏠', '🏢', '🏪', '🎯', '🎲', '🎮', '🎵', '🎬', '📷', '🖼️',
            '📈', '📉', '💰', '💳', '🛒', '🛍️', '📦', '🚚', '✈️', '🚗',
            '🔔', '📢', '💬', '💭', '❤️', '⭐', '🏆', '🎁', '🎉', '🔥'
        ];
        
        const grid = document.getElementById('iconGrid');
        grid.innerHTML = icons.map(icon => `
            <div class="icon-item" onclick="workspaceAdmin.selectIcon('${icon}')">${icon}</div>
        `).join('');
    }

    selectIcon(icon) {
        document.getElementById('workspaceIcon').value = icon;
        this.closeIconPicker();
    }

    // Export configuration
    exportConfig() {
        const config = {
            workspaces: this.workspaces,
            exported: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workspaces-config-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('Configuration exported', 'success');
    }

    // Theme toggle with localStorage persistence
    toggleTheme() {
        const isDark = document.body.classList.contains('dark-theme');
        
        if (isDark) {
            // Switch to light theme
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('admin-theme', 'light-theme');
            this.updateThemeIcon(false);
        } else {
            // Switch to dark theme
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('admin-theme', 'dark-theme');
            this.updateThemeIcon(true);
        }
        
        this.showToast(`Switched to ${isDark ? 'light' : 'dark'} mode`, 'success');
    }

    // Toast notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type];
        
        toast.innerHTML = `
            <span>${icon}</span>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize the admin panel
const workspaceAdmin = new WorkspaceAdmin();

// Add slide out animation
const style = document.createElement('style');
style.textContent = `
    @keyframes toastSlideOut {
        to {
            transform: translateX(120%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);