import './style.css';

// Workspace Manager Module
class WorkspaceManager {
    constructor() {
        this.workspaces = [];
        this.grid = document.getElementById('workspace-grid');
        this.init();
    }

    init() {
        console.log('Workspace Manager initialized');
        this.loadWorkspaces();
        
        // Set up auto-refresh every 30 seconds
        setInterval(() => this.loadWorkspaces(), 30000);
    }

    async loadWorkspaces() {
        // For now, use mock data
        // TODO: Replace with actual API call
        setTimeout(() => {
            this.workspaces = [
                {
                    name: 'www',
                    path: '/www',
                    description: 'Main website and landing pages',
                    status: 'active',
                    icon: '🌐'
                },
                {
                    name: 'api',
                    path: '/api',
                    description: 'Backend API services',
                    status: 'pending',
                    icon: '⚡'
                },
                {
                    name: 'blog',
                    path: '/blog',
                    description: 'Blog and content management',
                    status: 'pending',
                    icon: '📝'
                },
                {
                    name: 'admin',
                    path: '/admin',
                    description: 'Administration panel',
                    status: 'active',
                    icon: '🔧'
                }
            ];
            this.renderWorkspaces();
        }, 2000);
    }

    renderWorkspaces() {
        if (this.workspaces.length === 0) {
            this.grid.innerHTML = `
                <div class="placeholder">
                    <div class="loading"></div>
                    <h3>Scanning for workspaces...</h3>
                    <p>Workspace containers will appear here once they are deployed.</p>
                </div>
            `;
            return;
        }

        this.grid.innerHTML = this.workspaces.map(workspace => `
            <a href="${workspace.path}" class="workspace-card">
                <div class="workspace-header">
                    <div class="workspace-icon">${workspace.icon}</div>
                    <div>
                        <div class="workspace-title">${workspace.name}</div>
                    </div>
                </div>
                <div class="workspace-description">${workspace.description}</div>
                <span class="workspace-status ${workspace.status === 'active' ? 'active' : ''}">${workspace.status}</span>
            </a>
        `).join('');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new WorkspaceManager();
    });
} else {
    new WorkspaceManager();
}

// Hot Module Replacement support
if (import.meta.hot) {
    import.meta.hot.accept();
    console.log('HMR enabled - changes will auto-reload!');
}