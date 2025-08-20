import './style.css';

// Workspace Manager Module
class WorkspaceManager {
    constructor() {
        this.workspaces = [];
        this.init();
    }

    async init() {
        console.log('Workspace Manager initialized');
        await this.loadWorkspaces();
        this.checkForInvalidRoute();
        this.attachEventListeners();
    }

    async loadWorkspaces() {
        try {
            // Fetch workspace data from API
            const response = await fetch('/api/v1/workspaces');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.workspaces = data.workspaces || [];
            
            // Render the workspaces
            this.renderWorkspaces();
            
            console.log(`Loaded ${this.workspaces.length} workspaces from API`);
        } catch (error) {
            console.error('Failed to load workspaces:', error);
            // If API fails, keep the static HTML as fallback
            this.attachStaticEventListeners();
        }
    }

    renderWorkspaces() {
        const gridContainer = document.getElementById('workspace-grid');
        if (!gridContainer) return;

        // Clear existing content
        gridContainer.innerHTML = '';

        // Sort workspaces: active ones first, then by name
        const sortedWorkspaces = [...this.workspaces].sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return a.name.localeCompare(b.name);
        });

        // Render each workspace card
        sortedWorkspaces.forEach((workspace, index) => {
            const card = this.createWorkspaceCard(workspace, index);
            gridContainer.appendChild(card);
        });
    }

    createWorkspaceCard(workspace, index) {
        const isActive = workspace.status === 'active';
        const card = document.createElement('a');
        card.href = `/${workspace.slug}`;
        card.className = `workspace-card${!isActive ? ' coming-soon' : ''}`;
        card.style.setProperty('--card-index', index);

        card.innerHTML = `
            <div class="workspace-icon">${workspace.icon || '📁'}</div>
            <h3>${workspace.name}</h3>
            <p>${workspace.description || 'No description available'}</p>
            <div class="workspace-badge">${isActive ? 'Active' : 'Coming Soon'}</div>
        `;

        // Add click handler for inactive workspaces
        if (!isActive) {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                this.showComingSoonMessage(workspace.name);
            });
        }

        return card;
    }

    checkForInvalidRoute() {
        // Build valid paths from loaded workspaces
        const validPaths = ['/'];
        this.workspaces.forEach(workspace => {
            validPaths.push(`/${workspace.slug}`);
        });

        // Add any additional static routes
        validPaths.push('/what-are-workspaces.html');

        const currentPath = window.location.pathname;
        const isValidPath = validPaths.some(path => 
            currentPath === path || 
            currentPath === path + '/' ||
            (path !== '/' && currentPath.startsWith(path + '/'))
        );

        // If on an invalid path and not already on 404 page, redirect to 404
        if (!isValidPath && !currentPath.includes('404')) {
            console.warn(`Invalid route detected: ${currentPath}`);
            // In production, this would be handled by server, but for client-side fallback:
            if (window.location.hostname === 'localhost') {
                window.location.href = '/404.html';
            }
        }
    }

    attachEventListeners() {
        // Add staggered animation indices for floating effect
        document.querySelectorAll('.workspace-card').forEach((card, index) => {
            card.style.setProperty('--card-index', index);
        });
    }

    attachStaticEventListeners() {
        // Fallback for when API is not available
        document.querySelectorAll('.workspace-card').forEach((card, index) => {
            card.style.setProperty('--card-index', index);
        });

        document.querySelectorAll('.workspace-card.coming-soon').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                this.showComingSoonMessage(card.querySelector('h3').textContent);
            });
        });
    }

    showComingSoonMessage(workspaceName) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = `${workspaceName} workspace is coming soon!`;
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
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