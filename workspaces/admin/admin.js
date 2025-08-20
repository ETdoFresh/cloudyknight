// Workspace Admin Panel
class WorkspaceAdmin {
    constructor() {
        this.workspaces = [];
        this.currentEditId = null;
        this.slugManuallyEdited = false;
        this.apiUrl = '/api/v1';  // API endpoint
        this.initTheme();
        this.initAsync();
    }
    
    async initAsync() {
        try {
            await this.loadWorkspaces();
            this.init();
        } catch (error) {
            console.error('Failed to initialize workspace admin:', error);
            this.showToast('Failed to load workspaces. Please refresh the page.', 'error');
            // Initialize with empty workspaces so UI still works
            this.workspaces = [];
            this.init();
        }
    }

    init() {
        this.setupEventListeners();
        this.renderWorkspaces();
        this.updateStatistics();
    }

    // Initialize theme from shared workspace theme setting
    initTheme() {
        const savedTheme = localStorage.getItem('workspace-theme');
        
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            this.updateThemeIcon(true);
        } else if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            this.updateThemeIcon(false);
        } else {
            // Use system preference if no saved theme
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

    // Load workspaces from API
    async loadWorkspaces() {
        try {
            const response = await fetch(`${this.apiUrl}/workspaces`);
            if (response.ok) {
                const data = await response.json();
                this.workspaces = data.workspaces || [];
            } else {
                throw new Error('Failed to load workspaces from API');
            }
        } catch (error) {
            console.error('Error loading workspaces:', error);
            this.showToast('Failed to load workspaces', 'error');
            // Fallback to empty array
            this.workspaces = [];
        }
    }

    // Save workspaces - no longer needed as API handles persistence
    async saveWorkspaces() {
        // API handles persistence, just refresh the UI
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
        
        // Display name input auto-generates URL path
        document.getElementById('workspaceName').addEventListener('input', (e) => {
            // Only auto-generate path if it hasn't been manually edited
            if (!this.slugManuallyEdited) {
                const displayName = e.target.value;
                const generatedSlug = this.generateSlug(displayName);
                document.getElementById('workspacePath').value = generatedSlug;
                document.getElementById('workspaceSlug').value = generatedSlug;
            }
        });
        
        // URL Path input handling
        document.getElementById('workspacePath').addEventListener('input', (e) => {
            const path = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
            e.target.value = path;
            document.getElementById('workspaceSlug').value = path;
            
            // If user clears the field, reset to auto-generation
            if (path === '') {
                this.slugManuallyEdited = false;
                // Immediately generate from display name if it exists
                const displayName = document.getElementById('workspaceName').value;
                if (displayName) {
                    const generatedSlug = this.generateSlug(displayName);
                    e.target.value = generatedSlug;
                    document.getElementById('workspaceSlug').value = generatedSlug;
                }
            } else {
                // Mark as manually edited if it differs from auto-generated
                const displayName = document.getElementById('workspaceName').value;
                const expectedSlug = this.generateSlug(displayName);
                if (path !== expectedSlug && displayName !== '') {
                    this.slugManuallyEdited = true;
                }
            }
            
            // Check for uniqueness
            if (this.currentEditId !== path && this.workspaces.find(w => w.slug === path)) {
                e.target.setCustomValidity('This URL path is already in use');
            } else {
                e.target.setCustomValidity('');
            }
        });
        
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
            this.slugManuallyEdited = true; // In edit mode, assume slug is intentional
            
            document.getElementById('workspaceId').value = workspace.id;
            document.getElementById('workspaceIcon').value = workspace.icon;
            document.getElementById('workspaceName').value = workspace.name;
            document.getElementById('workspaceSlug').value = workspace.slug;
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
            this.slugManuallyEdited = false; // Reset the manual edit flag
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
        this.slugManuallyEdited = false;
    }

    async saveWorkspace() {
        const formData = {
            slug: document.getElementById('workspacePath').value,  // Use path value as slug
            icon: document.getElementById('workspaceIcon').value || '📁',
            name: document.getElementById('workspaceName').value,
            description: document.getElementById('workspaceDescription').value,
            status: document.getElementById('workspaceStatus').value,
            type: document.getElementById('workspaceType').value
        };
        
        try {
            if (this.currentEditId) {
                // Update existing workspace via API
                const response = await fetch(`${this.apiUrl}/workspaces/${this.currentEditId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    this.showToast(`Workspace "${formData.name}" updated`, 'success');
                    await this.loadWorkspaces();
                    this.renderWorkspaces();
                    this.updateStatistics();
                } else {
                    throw new Error('Failed to update workspace');
                }
            } else {
                // Create new workspace via API
                const response = await fetch(`${this.apiUrl}/workspaces`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    this.showToast(`Workspace "${formData.name}" created`, 'success');
                    await this.loadWorkspaces();
                    this.renderWorkspaces();
                    this.updateStatistics();
                } else if (response.status === 409) {
                    throw new Error('Workspace with this slug already exists');
                } else {
                    throw new Error('Failed to create workspace');
                }
            }
            
            this.closeModal();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
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

    async deleteWorkspace(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        
        try {
            const response = await fetch(`${this.apiUrl}/workspaces/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showToast(`Workspace "${workspace.name}" deleted`, 'success');
                await this.loadWorkspaces();
                this.renderWorkspaces();
                this.updateStatistics();
            } else {
                throw new Error('Failed to delete workspace');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
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
            <div class="workspace-admin-card" data-workspace-id="${workspace.id}">
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
                    <button class="btn btn-secondary btn-small" onclick="workspaceAdmin.editWorkspace('${workspace.id}')">
                        Edit
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="workspaceAdmin.viewWorkspace('${workspace.slug}')">
                        View
                    </button>
                    ${workspace.status === 'active' ? 
                        `<button class="btn btn-warning btn-small" onclick="workspaceAdmin.toggleStatus('${workspace.id}')">Hide</button>` :
                        `<button class="btn btn-success btn-small" onclick="workspaceAdmin.toggleStatus('${workspace.id}')">Activate</button>`
                    }
                    <button class="btn btn-info btn-small" onclick="workspaceAdmin.restartDocker('${workspace.slug}')" title="Restart Docker container">
                        🔄 Restart
                    </button>
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

    editWorkspace(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        if (workspace) {
            this.openModal(workspace);
        }
    }

    viewWorkspace(slug) {
        // Navigate directly to the workspace
        window.location.href = `/${slug}`;
    }

    async toggleStatus(id) {
        const workspace = this.workspaces.find(w => w.id === id);
        if (workspace) {
            const newStatus = workspace.status === 'active' ? 'hidden' : 'active';
            
            try {
                const response = await fetch(`${this.apiUrl}/workspaces/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                
                if (response.ok) {
                    if (newStatus === 'hidden') {
                        this.showToast(`Workspace "${workspace.name}" is now hidden`, 'warning');
                    } else {
                        this.showToast(`Workspace "${workspace.name}" is now active`, 'success');
                    }
                    await this.loadWorkspaces();
                    this.renderWorkspaces();
                    this.updateStatistics();
                } else {
                    throw new Error('Failed to update workspace status');
                }
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        }
    }

    async restartDocker(slug) {
        try {
            this.showToast(`Restarting Docker container for ${slug}...`, 'info');
            
            const response = await fetch(`${this.apiUrl}/workspaces/${slug}/docker/restart`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showToast(`Docker container for ${slug} restarted successfully`, 'success');
            } else {
                throw new Error('Failed to restart Docker container');
            }
        } catch (error) {
            this.showToast(`Failed to restart Docker container: ${error.message}`, 'error');
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

    // Helper method to generate slug from display name
    generateSlug(displayName) {
        return displayName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
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

    // Theme toggle with shared workspace theme persistence
    toggleTheme() {
        const isDark = document.body.classList.contains('dark-theme');
        
        if (isDark) {
            // Switch to light theme
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('workspace-theme', 'light');
            this.updateThemeIcon(false);
        } else {
            // Switch to dark theme
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('workspace-theme', 'dark');
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

// Initialize the admin panel and make it globally accessible
const workspaceAdmin = new WorkspaceAdmin();
window.workspaceAdmin = workspaceAdmin;  // Make available for onclick handlers

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