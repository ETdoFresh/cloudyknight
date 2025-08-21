import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

class TerminalApp {
    constructor() {
        this.currentWorkspace = null;
        this.terminal = null;
        this.fitAddon = null;
        this.attachAddon = null;
        this.ws = null;
        
        this.init();
    }
    
    async init() {
        // Load theme
        this.loadTheme();
        
        // Load workspaces
        await this.loadWorkspaces();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.fitAddon) {
                this.fitAddon.fit();
            }
        });
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
    
    async openTerminal() {
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
        
        // Initialize terminal if not already done
        if (!this.terminal) {
            this.initTerminal();
        } else {
            // Clean up previous connection
            this.disconnectWebSocket();
        }
        
        // Connect to ttyd WebSocket
        await this.connectToSandbox();
    }
    
    initTerminal() {
        // Create terminal instance
        this.terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Consolas, "Courier New", monospace',
            theme: {
                background: getComputedStyle(document.documentElement)
                    .getPropertyValue('--terminal-bg').trim(),
                foreground: getComputedStyle(document.documentElement)
                    .getPropertyValue('--terminal-text').trim(),
                cursor: '#f0f0f0',
                cursorAccent: '#000000',
                selection: 'rgba(255, 255, 255, 0.3)'
            },
            convertEol: true,
            scrollback: 10000
        });
        
        // Add fit addon
        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        
        // Add web links addon
        const webLinksAddon = new WebLinksAddon();
        this.terminal.loadAddon(webLinksAddon);
        
        // Open terminal in container
        this.terminal.open(document.getElementById('terminal'));
        this.fitAddon.fit();
    }
    
    async connectToSandbox() {
        try {
            // Connect directly to ttyd WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/terminal/ws`;
            
            console.log('Connecting to ttyd WebSocket:', wsUrl);
            this.connectWebSocket(wsUrl);
        } catch (error) {
            console.error('Failed to connect to sandbox:', error);
            this.terminal.writeln('\x1b[1;31mFailed to connect to sandbox. Please try again.\x1b[0m');
            this.updateStatus('Connection failed');
        }
    }
    
    connectWebSocket(wsUrl) {
        console.log('Opening WebSocket connection:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        // Create attach addon for bidirectional communication
        this.attachAddon = new AttachAddon(this.ws);
        this.terminal.loadAddon(this.attachAddon);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('Connected');
            
            // Fit terminal on connection
            setTimeout(() => {
                this.fitAddon.fit();
            }, 100);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.terminal.writeln('\x1b[1;31mConnection error. Please refresh and try again.\x1b[0m');
            this.updateStatus('Connection error');
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateStatus('Disconnected');
            
            // Dispose of attach addon
            if (this.attachAddon) {
                this.attachAddon.dispose();
                this.attachAddon = null;
            }
        };
    }
    
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        if (this.attachAddon) {
            this.attachAddon.dispose();
            this.attachAddon = null;
        }
        
        // Clear terminal
        this.terminal.clear();
    }
    
    updateStatus(text) {
        document.getElementById('statusText').textContent = text;
    }
    
    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
            
            // Update terminal theme
            if (this.terminal) {
                const isDark = document.body.classList.contains('dark-mode');
                this.terminal.options.theme = {
                    background: isDark ? '#0c0c0c' : '#1e1e1e',
                    foreground: isDark ? '#e0e0e0' : '#d4d4d4',
                    cursor: '#f0f0f0',
                    cursorAccent: '#000000',
                    selection: 'rgba(255, 255, 255, 0.3)'
                };
            }
        });
        
        // Clear terminal
        document.getElementById('clearBtn').addEventListener('click', () => {
            if (this.terminal) {
                this.terminal.clear();
            }
        });
        
        // Change workspace
        document.getElementById('changeWorkspaceBtn').addEventListener('click', () => {
            // Disconnect current session
            this.disconnectWebSocket();
            
            // Show modal
            document.getElementById('workspaceModal').classList.add('active');
            document.getElementById('terminalContainer').classList.add('hidden');
            
            // Clear selection
            document.querySelectorAll('.workspace-item').forEach(el => {
                el.classList.remove('selected');
            });
        });
        
        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            if (this.currentWorkspace) {
                document.getElementById('workspaceModal').classList.remove('active');
                document.getElementById('terminalContainer').classList.remove('hidden');
            }
        });
        
        // Handle terminal resize
        const resizeObserver = new ResizeObserver(() => {
            if (this.fitAddon) {
                this.fitAddon.fit();
            }
        });
        
        const terminalElement = document.getElementById('terminal');
        if (terminalElement) {
            resizeObserver.observe(terminalElement);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});