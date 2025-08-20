import './style.css';

// Workspace Manager Module
class WorkspaceManager {
    constructor() {
        this.init();
    }

    init() {
        console.log('Workspace Manager initialized');
        this.checkForInvalidRoute();
        this.attachEventListeners();
    }

    checkForInvalidRoute() {
        // Client-side route validation
        const validPaths = [
            '/',
            '/admin',
            '/www',
            '/api',
            '/blog',
            '/docs',
            '/analytics',
            '/database',
            '/storage',
            '/monitor',
            '/settings',
            '/clock'
        ];

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

        // Add click handlers for coming soon cards
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