class TerminalApp {
    constructor() {
        this.currentWorkspace = null;
        this.init();
    }
    
    async init() {
        // Load theme
        this.loadTheme();
        
        // Load workspaces
        await this.loadWorkspaces();
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('workspace-theme');
        const isDarkMode = savedTheme === 'dark' || 
            (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        document.body.classList.toggle('dark-mode', isDarkMode);
    }
    
    toggleTheme() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        localStorage.setItem('workspace-theme', isDarkMode ? 'dark' : 'light');
    }
    
    async loadWorkspaces() {
        try {
            const response = await fetch('/api/v1/workspaces');
            const data = await response.json();
            const workspaces = Array.isArray(data) ? data : (data.workspaces || []);
            
            this.renderWorkspaceList(workspaces);
        } catch (error) {
            console.error('Failed to load workspaces:', error);
            this.renderWorkspaceList([]);
        }
    }
    
    renderWorkspaceList(workspaces) {
        const listContainer = document.getElementById('workspaceList');
        
        if (workspaces.length === 0) {
            listContainer.innerHTML = '<div class="loading">No workspaces available</div>';
            return;
        }
        
        listContainer.innerHTML = workspaces.map(ws => `
            <div class="workspace-item" data-slug="${ws.slug}">
                <span class="workspace-icon">${ws.icon || '📁'}</span>
                <div class="workspace-details">
                    <div class="workspace-name">${ws.name}</div>
                    <div class="workspace-desc">${ws.description || 'No description'}</div>
                </div>
                <span class="workspace-status ${ws.status || 'active'}">${ws.status || 'active'}</span>
            </div>
        `).join('');
        
        // Add click handlers
        listContainer.querySelectorAll('.workspace-item').forEach(item => {
            item.addEventListener('click', () => this.selectWorkspace(item));
        });
    }
    
    selectWorkspace(item) {
        // Remove previous selection
        document.querySelectorAll('.workspace-item').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection
        item.classList.add('selected');
        
        // Store workspace info
        this.currentWorkspace = {
            slug: item.dataset.slug,
            name: item.querySelector('.workspace-name').textContent,
            icon: item.querySelector('.workspace-icon').textContent
        };
        
        // Open terminal
        this.openTerminal();
    }
    
    openTerminal() {
        if (!this.currentWorkspace) return;
        
        // Hide modal
        document.getElementById('workspaceModal').classList.remove('active');
        
        // Show terminal container
        document.getElementById('terminalContainer').classList.remove('hidden');
        
        // Update workspace info
        document.getElementById('workspaceInfo').innerHTML = 
            `${this.currentWorkspace.icon} ${this.currentWorkspace.name}`;
        
        // Update workspace path
        document.getElementById('workspacePath').textContent = 
            `Workspace: /workspaces/${this.currentWorkspace.slug}`;
        
        // Update status
        this.updateStatus('Connecting to terminal...');
        
        // Create iframe for ttyd
        const terminalDiv = document.getElementById('terminal');
        terminalDiv.innerHTML = `
            <iframe 
                id="ttydFrame"
                src="/terminal/ws" 
                style="width: 100%; height: 100%; border: none; background: #1e1e1e;"
                onload="this.contentWindow.focus();"
            ></iframe>
        `;
        
        // Update status after iframe loads
        const iframe = document.getElementById('ttydFrame');
        iframe.onload = () => {
            this.updateStatus('Connected');
            // Try to focus the iframe
            try {
                iframe.contentWindow.focus();
            } catch (e) {
                // Cross-origin, can't focus
            }
        };
    }
    
    updateStatus(text) {
        document.getElementById('statusText').textContent = text;
    }
    
    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // Clear terminal (reload iframe)
        document.getElementById('clearBtn').addEventListener('click', () => {
            const iframe = document.getElementById('ttydFrame');
            if (iframe) {
                iframe.src = iframe.src; // Reload the iframe
                this.updateStatus('Terminal cleared');
            }
        });
        
        // Change workspace
        document.getElementById('changeWorkspaceBtn').addEventListener('click', () => {
            document.getElementById('workspaceModal').classList.add('active');
            document.getElementById('terminalContainer').classList.add('hidden');
            
            // Clear selection
            document.querySelectorAll('.workspace-item').forEach(el => {
                el.classList.remove('selected');
            });
            
            // Remove iframe
            document.getElementById('terminal').innerHTML = '';
        });
        
        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            if (this.currentWorkspace) {
                document.getElementById('workspaceModal').classList.remove('active');
                document.getElementById('terminalContainer').classList.remove('hidden');
            }
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});