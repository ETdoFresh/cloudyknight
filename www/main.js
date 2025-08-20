import './style.css';

// Workspace Manager Module
class WorkspaceManager {
    constructor() {
        this.init();
    }

    init() {
        console.log('Workspace Manager initialized');
        this.attachEventListeners();
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