import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

class TerminalApp {
    constructor() {
        this.currentWorkspace = null;
        this.terminal = null;
        this.fitAddon = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentCommand = '';
        this.commandCount = 0;
        this.currentPath = '.';
        
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
    
    openTerminal() {
        if (!this.currentWorkspace) return;
        
        // Hide modal
        document.getElementById('workspaceModal').classList.remove('active');
        
        // Show terminal container
        document.getElementById('terminalContainer').classList.remove('hidden');
        
        // Update workspace info
        document.getElementById('workspaceInfo').innerHTML = 
            `${this.currentWorkspace.icon} ${this.currentWorkspace.name}`;
        
        // Initialize terminal if not already done
        if (!this.terminal) {
            this.initTerminal();
        }
        
        // Clear and show welcome message
        this.terminal.clear();
        this.showWelcomeMessage();
        this.showPrompt();
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
            scrollback: 1000
        });
        
        // Add addons
        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        
        const webLinksAddon = new WebLinksAddon();
        this.terminal.loadAddon(webLinksAddon);
        
        // Open terminal in container
        this.terminal.open(document.getElementById('terminal'));
        this.fitAddon.fit();
        
        // Setup input handling
        this.setupTerminalInput();
    }
    
    setupTerminalInput() {
        this.terminal.onData(data => {
            // Handle special keys
            if (data === '\r') { // Enter
                this.executeCommand();
            } else if (data === '\x7f') { // Backspace
                if (this.currentCommand.length > 0) {
                    this.currentCommand = this.currentCommand.slice(0, -1);
                    this.terminal.write('\b \b');
                }
            } else if (data === '\x1b[A') { // Up arrow
                this.navigateHistory(-1);
            } else if (data === '\x1b[B') { // Down arrow
                this.navigateHistory(1);
            } else if (data === '\x03') { // Ctrl+C
                this.currentCommand = '';
                this.terminal.write('^C\r\n');
                this.showPrompt();
            } else if (data === '\x0c') { // Ctrl+L
                this.terminal.clear();
                this.showPrompt();
            } else if (data.charCodeAt(0) >= 32) { // Printable characters
                this.currentCommand += data;
                this.terminal.write(data);
            }
        });
    }
    
    showWelcomeMessage() {
        const messages = [
            `\x1b[1;32mCloudyKnight Terminal\x1b[0m`,
            `Connected to workspace: \x1b[1;34m${this.currentWorkspace.name}\x1b[0m`,
            `Type 'help' for available commands`,
            ``
        ];
        
        messages.forEach(msg => this.terminal.writeln(msg));
    }
    
    showPrompt() {
        const prompt = `\x1b[1;32m${this.currentWorkspace.slug}\x1b[0m:\x1b[1;34m${this.currentPath}\x1b[0m$ `;
        this.terminal.write(prompt);
    }
    
    async executeCommand() {
        const command = this.currentCommand.trim();
        this.terminal.writeln('');
        
        if (!command) {
            this.showPrompt();
            return;
        }
        
        // Add to history
        this.commandHistory.push(command);
        this.historyIndex = this.commandHistory.length;
        this.commandCount++;
        document.getElementById('commandCount').textContent = `Commands: ${this.commandCount}`;
        
        // Handle special commands
        if (command === 'help') {
            this.showHelp();
        } else if (command === 'clear') {
            this.terminal.clear();
        } else if (command.startsWith('cd ')) {
            await this.changeDirectory(command.slice(3));
        } else {
            await this.runCommand(command);
        }
        
        // Reset current command and show prompt
        this.currentCommand = '';
        this.showPrompt();
    }
    
    showHelp() {
        const helpText = [
            '\x1b[1;33mAvailable Commands:\x1b[0m',
            '  help         - Show this help message',
            '  clear        - Clear the terminal',
            '  cd <dir>     - Change directory',
            '  ls           - List files and directories',
            '  pwd          - Print working directory',
            '  cat <file>   - Display file contents',
            '  mkdir <dir>  - Create directory',
            '  touch <file> - Create empty file',
            '  rm <file>    - Remove file',
            '  echo <text>  - Print text',
            '',
            '\x1b[1;33mKeyboard Shortcuts:\x1b[0m',
            '  Ctrl+C       - Cancel current command',
            '  Ctrl+L       - Clear screen',
            '  Up/Down      - Navigate command history',
            ''
        ];
        
        helpText.forEach(line => this.terminal.writeln(line));
    }
    
    async changeDirectory(path) {
        if (!path) {
            this.currentPath = '.';
            return;
        }
        
        try {
            // Validate path exists
            const response = await fetch(`/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `test -d "${path}" && echo "exists" || echo "not found"`,
                    cwd: this.currentPath
                })
            });
            
            const result = await response.json();
            
            if (result.result && result.result.stdout.trim() === 'exists') {
                // Update current path
                if (path.startsWith('/')) {
                    this.currentPath = path;
                } else if (path === '..') {
                    const parts = this.currentPath.split('/').filter(p => p);
                    parts.pop();
                    this.currentPath = parts.length ? parts.join('/') : '.';
                } else {
                    this.currentPath = this.currentPath === '.' ? path : `${this.currentPath}/${path}`;
                }
                
                this.updateStatus('Directory changed');
            } else {
                this.terminal.writeln(`\x1b[1;31mcd: ${path}: No such file or directory\x1b[0m`);
            }
        } catch (error) {
            this.terminal.writeln(`\x1b[1;31mError: ${error.message}\x1b[0m`);
        }
    }
    
    async runCommand(command) {
        this.updateStatus('Executing command...');
        
        try {
            const response = await fetch(`/api/v1/workspaces/${this.currentWorkspace.slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    cwd: this.currentPath
                })
            });
            
            const result = await response.json();
            
            if (result.error) {
                this.terminal.writeln(`\x1b[1;31mError: ${result.error}\x1b[0m`);
            } else if (result.result) {
                // Show stdout
                if (result.result.stdout) {
                    result.result.stdout.split('\n').forEach(line => {
                        if (line) this.terminal.writeln(line);
                    });
                }
                
                // Show stderr in red
                if (result.result.stderr) {
                    result.result.stderr.split('\n').forEach(line => {
                        if (line) this.terminal.writeln(`\x1b[1;31m${line}\x1b[0m`);
                    });
                }
                
                // Update status based on success
                if (result.result.success) {
                    this.updateStatus('Command executed');
                } else {
                    this.updateStatus(`Command failed (code: ${result.result.code})`);
                }
            }
        } catch (error) {
            this.terminal.writeln(`\x1b[1;31mError: ${error.message}\x1b[0m`);
            this.updateStatus('Command failed');
        }
    }
    
    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;
        
        // Clear current line
        for (let i = 0; i < this.currentCommand.length; i++) {
            this.terminal.write('\b \b');
        }
        
        // Update history index
        this.historyIndex += direction;
        this.historyIndex = Math.max(0, Math.min(this.historyIndex, this.commandHistory.length));
        
        // Get command from history
        if (this.historyIndex < this.commandHistory.length) {
            this.currentCommand = this.commandHistory[this.historyIndex];
        } else {
            this.currentCommand = '';
        }
        
        // Write command to terminal
        this.terminal.write(this.currentCommand);
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
                this.showPrompt();
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
            
            // Reset terminal
            if (this.terminal) {
                this.terminal.clear();
                this.currentCommand = '';
                this.currentPath = '.';
            }
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