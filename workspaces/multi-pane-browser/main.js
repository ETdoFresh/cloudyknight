class MultiPaneBrowser {
    constructor() {
        this.currentLayout = null;
        this.panes = [];
        this.savedUrls = [];
        this.storagePrefix = this.getStoragePrefix();
        this.init();
    }
    
    getStoragePrefix() {
        // Detect if we're in an iframe and build a hierarchical path
        let prefix = 'multiPane';
        let currentWindow = window;
        let depth = 0;
        let path = [];
        
        // Try to traverse up the frame hierarchy
        try {
            while (currentWindow !== currentWindow.parent && depth < 10) {
                depth++;
                // Try to get the iframe index in parent
                if (currentWindow.parent && currentWindow.parent.frames) {
                    for (let i = 0; i < currentWindow.parent.frames.length; i++) {
                        if (currentWindow.parent.frames[i] === currentWindow) {
                            path.unshift(i); // Add to beginning of path
                            break;
                        }
                    }
                }
                currentWindow = currentWindow.parent;
            }
        } catch (e) {
            // Cross-origin, can't traverse further
            // Use a fallback method based on URL parameters or hash
            const urlParams = new URLSearchParams(window.location.search);
            const frameId = urlParams.get('frameId') || window.location.hash.replace('#frame-', '');
            if (frameId) {
                path = frameId.split('-').map(Number);
            }
        }
        
        // Build the storage prefix based on the path
        if (path.length > 0) {
            prefix += '_frame_' + path.join('_');
        }
        
        // Add visual indicator if we're in a frame
        if (depth > 0 || path.length > 0) {
            this.addFrameIndicator(path);
        }
        
        return prefix;
    }
    
    addFrameIndicator(path) {
        // Add a small indicator showing we're in a nested frame
        setTimeout(() => {
            const header = document.querySelector('.header-right');
            if (header && !document.querySelector('.frame-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'frame-indicator';
                const depth = path.length || 1;
                const pathStr = path.length > 0 ? path.join('.') : '?';
                
                // Style with depth-based color
                const hue = (depth * 60) % 360; // Different color for each depth
                indicator.style.cssText = `
                    padding: 4px 10px;
                    background: hsl(${hue}, 70%, 50%);
                    color: white;
                    border-radius: 4px;
                    font-size: 12px;
                    margin-left: 10px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                `;
                
                // Add nested icon based on depth
                const icon = '⊞'.repeat(Math.min(depth, 3));
                indicator.innerHTML = `<span style="opacity: 0.8">${icon}</span> Frame ${pathStr}`;
                indicator.title = `This multi-pane browser is nested ${depth} level${depth > 1 ? 's' : ''} deep (path: ${this.storagePrefix})`;
                header.insertBefore(indicator, header.firstChild);
            }
        }, 100);
    }

    init() {
        this.loadTheme();
        this.setupEventListeners();
        this.loadSavedLayout();
        
        // Save URLs before page unload
        window.addEventListener('beforeunload', () => {
            this.saveCurrentUrls();
        });
    }

    setupEventListeners() {
        // Layout selection
        document.querySelectorAll('.layout-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const layout = e.currentTarget.dataset.layout;
                this.setLayout(layout);
                this.closeLayoutModal();
            });
        });

        // Header buttons
        document.getElementById('changeLayoutBtn').addEventListener('click', () => {
            this.openLayoutModal();
        });

        document.getElementById('resetLayoutBtn').addEventListener('click', () => {
            this.resetLayout();
        });

        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            this.toggleTheme();
        });

        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Quick links
        document.querySelectorAll('.quick-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const url = e.currentTarget.dataset.url;
                this.loadUrlInActivePane(url);
            });
        });
    }

    setLayout(layoutType, isInitialLoad = false) {
        // Save current URLs before changing layout (but not on initial load)
        if (!isInitialLoad && this.panes.length > 0) {
            this.saveCurrentUrls();
        }
        
        this.currentLayout = layoutType;
        const container = document.getElementById('panesContainer');
        container.innerHTML = '';
        container.className = `panes-container ${layoutType}`;
        
        // Clear panes array since we're rebuilding
        this.panes = [];
        
        // Save layout preference with prefix
        localStorage.setItem(`${this.storagePrefix}_layout`, layoutType);

        // Create panes based on layout
        switch(layoutType) {
            case 'horizontal-50-50':
                this.createPane(container);
                this.createPane(container);
                break;
                
            case 'vertical-50-50':
                this.createPane(container);
                this.createPane(container);
                break;
                
            case 'grid-2x2':
                this.createPane(container);
                this.createPane(container);
                this.createPane(container);
                this.createPane(container);
                break;
                
            case 'two-left-one-right':
                const leftColumn = document.createElement('div');
                leftColumn.className = 'left-column';
                this.createPane(leftColumn);
                this.createPane(leftColumn);
                container.appendChild(leftColumn);
                this.createPane(container);
                break;
                
            case 'one-left-two-right':
                this.createPane(container);
                const rightColumn = document.createElement('div');
                rightColumn.className = 'right-column';
                this.createPane(rightColumn);
                this.createPane(rightColumn);
                container.appendChild(rightColumn);
                break;
                
            case 'three-equal':
            case 'three-focused':
                this.createPane(container);
                this.createPane(container);
                this.createPane(container);
                break;
        }

        // Load default URLs in panes
        this.loadDefaultUrls();
        
        // Add resizers after layout is set and panes are loaded
        setTimeout(() => {
            this.addResizers();
        }, 100);
    }

    createPane(parent) {
        const paneId = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const pane = document.createElement('div');
        pane.className = 'pane';
        pane.id = paneId;
        
        pane.innerHTML = `
            <div class="pane-header">
                <button class="pane-btn" data-action="home" title="Home">🏠</button>
                <input type="text" class="pane-url-input" placeholder="Enter URL or select from Quick Links">
                <div class="pane-actions">
                    <button class="pane-btn" data-action="go" title="Go">→</button>
                    <button class="pane-btn" data-action="refresh" title="Refresh">↻</button>
                    <button class="pane-btn" data-action="back" title="Back">←</button>
                    <button class="pane-btn" data-action="forward" title="Forward">→</button>
                    <button class="pane-btn" data-action="close" title="Close">✕</button>
                </div>
            </div>
            <div class="pane-content">
                <div class="pane-loading">Ready to load content...</div>
                <iframe class="pane-iframe" style="display: none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
            </div>
        `;
        
        parent.appendChild(pane);
        
        // Setup pane event listeners
        this.setupPaneEventListeners(pane);
        
        // Add to panes array
        this.panes.push({
            id: paneId,
            element: pane,
            iframe: pane.querySelector('.pane-iframe'),
            urlInput: pane.querySelector('.pane-url-input')
        });
        
        return pane;
    }

    setupPaneEventListeners(pane) {
        const urlInput = pane.querySelector('.pane-url-input');
        const iframe = pane.querySelector('.pane-iframe');
        const loading = pane.querySelector('.pane-loading');
        
        // URL input enter key
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadUrl(pane, urlInput.value);
            }
        });
        
        // Action buttons
        pane.querySelectorAll('.pane-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handlePaneAction(pane, action);
            });
        });

        // Focus on pane click
        pane.addEventListener('click', () => {
            this.setActivePane(pane);
        });
        
        // Monitor iframe navigation (for same-origin pages)
        iframe.addEventListener('load', () => {
            try {
                // Try to get the current URL from the iframe
                const currentUrl = iframe.contentWindow.location.pathname;
                const currentHash = iframe.contentWindow.location.hash;
                if (currentUrl && currentUrl !== 'about:blank') {
                    // For multi-pane URLs, include the hash but clean it up for display
                    if (currentUrl.includes('multi-pane-browser') && currentHash) {
                        urlInput.value = currentUrl; // Don't show frame ID in URL bar
                    } else {
                        urlInput.value = currentUrl;
                    }
                }
            } catch (e) {
                // Cross-origin, can't access the URL
                // Try to at least update from iframe.src
                if (iframe.src && iframe.src !== 'about:blank') {
                    try {
                        const url = new URL(iframe.src);
                        // Clean up frame IDs from display
                        const cleanPath = url.pathname;
                        urlInput.value = cleanPath;
                    } catch {
                        // Keep existing URL
                    }
                }
            }
        });
    }

    handlePaneAction(pane, action) {
        const iframe = pane.querySelector('.pane-iframe');
        const urlInput = pane.querySelector('.pane-url-input');
        
        switch(action) {
            case 'home':
                urlInput.value = '/';
                this.loadUrl(pane, '/');
                break;
            case 'go':
                this.loadUrl(pane, urlInput.value);
                break;
            case 'refresh':
                if (iframe.src) {
                    iframe.src = iframe.src;
                }
                break;
            case 'back':
                // Browser back functionality would require more complex iframe history management
                break;
            case 'forward':
                // Browser forward functionality would require more complex iframe history management
                break;
            case 'close':
                if (this.panes.length > 1) {
                    this.closePane(pane);
                }
                break;
        }
    }

    loadUrl(pane, url) {
        const iframe = pane.querySelector('.pane-iframe');
        const loading = pane.querySelector('.pane-loading');
        const urlInput = pane.querySelector('.pane-url-input');
        
        if (!url) return;
        
        // Ensure URL has protocol or is a relative path
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
            url = 'https://' + url;
        }
        
        // Update input value (clean version without frame ID)
        const cleanUrl = url.split('#frame-')[0];
        urlInput.value = cleanUrl;
        
        // If loading multi-pane-browser, add/update frame ID to help with nesting
        if (url.includes('multi-pane-browser')) {
            const paneIndex = this.panes.findIndex(p => p.element === pane);
            const currentPath = this.storagePrefix.replace('multiPane_frame_', '').replace('multiPane', '');
            const framePath = currentPath ? `${currentPath}_${paneIndex}` : `${paneIndex}`;
            
            // Remove any existing frame ID and add new one
            const baseUrl = url.split('#frame-')[0];
            url = `${baseUrl}#frame-${framePath}`;
            
            // Force reload by adding timestamp if same URL
            if (iframe.src && iframe.src.includes(baseUrl)) {
                url = `${baseUrl}?t=${Date.now()}#frame-${framePath}`;
            }
        }
        
        // Show loading
        loading.style.display = 'block';
        loading.textContent = 'Loading...';
        iframe.style.display = 'none';
        
        // Load URL in iframe
        iframe.src = url;
        
        iframe.onload = () => {
            loading.style.display = 'none';
            iframe.style.display = 'block';
        };
        
        iframe.onerror = () => {
            loading.textContent = 'Failed to load content';
        };
    }

    loadUrlInActivePane(url) {
        // Find active pane or use first pane
        const activePane = document.querySelector('.pane.active') || document.querySelector('.pane');
        if (activePane) {
            const urlInput = activePane.querySelector('.pane-url-input');
            urlInput.value = url;
            this.loadUrl(activePane, url);
        }
    }

    setActivePane(pane) {
        // Remove active class from all panes
        document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
        // Add active class to clicked pane
        pane.classList.add('active');
    }

    closePane(pane) {
        // Remove from panes array
        this.panes = this.panes.filter(p => p.element !== pane);
        
        // Remove from DOM
        pane.remove();
        
        // If no panes left, show layout selector
        if (this.panes.length === 0) {
            this.openLayoutModal();
        }
    }

    loadDefaultUrls() {
        // First check for saved URLs from memory (layout change), then localStorage (page reload)
        const savedUrls = this.savedUrls.length > 0 
            ? this.savedUrls 
            : JSON.parse(localStorage.getItem(`${this.storagePrefix}_urls`) || '[]');
        
        if (savedUrls.length > 0) {
            // Use saved URLs
            this.panes.forEach((pane, index) => {
                const url = savedUrls[index] || '/';
                pane.urlInput.value = url;
                this.loadUrl(pane.element, url);
            });
        } else {
            // Load workspace browser in all panes by default (first time only)
            this.panes.forEach((pane) => {
                pane.urlInput.value = '/';
                this.loadUrl(pane.element, '/');
            });
        }
    }
    
    saveCurrentUrls() {
        const urls = this.panes.map(pane => {
            // First try to get URL from the input (which should be the clean URL)
            if (pane.urlInput.value && pane.urlInput.value !== '') {
                // Clean any query params that were added for cache busting
                let cleanUrl = pane.urlInput.value;
                if (cleanUrl.includes('?t=')) {
                    cleanUrl = cleanUrl.split('?t=')[0];
                }
                return cleanUrl;
            }
            
            // Fallback: try to get from iframe
            const iframe = pane.iframe;
            if (iframe && iframe.src && iframe.src !== 'about:blank') {
                try {
                    // Try to access the actual location (works for same-origin)
                    const currentUrl = iframe.contentWindow.location.pathname;
                    if (currentUrl && currentUrl !== 'about:blank') {
                        // Clean the URL of frame IDs and timestamps
                        let cleanUrl = currentUrl;
                        if (cleanUrl.includes('?t=')) {
                            cleanUrl = cleanUrl.split('?t=')[0];
                        }
                        return cleanUrl;
                    }
                } catch {
                    // Cross-origin, extract from src
                    try {
                        const url = new URL(iframe.src);
                        let cleanPath = url.pathname;
                        if (cleanPath.includes('?t=')) {
                            cleanPath = cleanPath.split('?t=')[0];
                        }
                        return cleanPath;
                    } catch {
                        // Fall through to default
                    }
                }
            }
            
            return '/';
        });
        localStorage.setItem(`${this.storagePrefix}_urls`, JSON.stringify(urls));
        // Also keep in memory for layout changes
        this.savedUrls = urls;
    }

    openLayoutModal() {
        document.getElementById('layoutModal').classList.add('active');
    }

    closeLayoutModal() {
        document.getElementById('layoutModal').classList.remove('active');
    }

    resetLayout() {
        if (this.currentLayout) {
            this.setLayout(this.currentLayout);
        } else {
            this.openLayoutModal();
        }
    }

    toggleFullscreen() {
        document.body.classList.toggle('fullscreen');
        const icon = document.querySelector('#fullscreenBtn span');
        icon.textContent = document.body.classList.contains('fullscreen') ? '⛶' : '⛶';
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        // Use workspace-theme key for consistency across workspaces
        localStorage.setItem('workspace-theme', isDark ? 'dark' : 'light');
        document.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
        
        // Refresh all iframes to apply the new theme
        this.refreshAllPanes();
    }
    
    refreshAllPanes() {
        // Refresh all iframes to pick up the new theme
        this.panes.forEach(pane => {
            // pane is an object with iframe property
            const iframe = pane.iframe;
            if (iframe && iframe.src) {
                // Store current src and reload
                const currentSrc = iframe.src;
                iframe.src = currentSrc;
            }
        });
    }

    loadTheme() {
        // Use workspace-theme key for consistency across workspaces
        const savedTheme = localStorage.getItem('workspace-theme');
        const isDarkMode = savedTheme === 'dark' || 
            (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            document.querySelector('.theme-icon').textContent = '☀️';
        }
    }

    loadSavedLayout() {
        const savedLayout = localStorage.getItem(`${this.storagePrefix}_layout`);
        if (savedLayout) {
            this.setLayout(savedLayout, true); // Pass true for initial load
            this.closeLayoutModal();
        }
        // If no saved layout, the modal will stay open (it starts as active)
    }

    addResizers() {
        const container = document.getElementById('panesContainer');
        const layout = this.currentLayout;
        
        // Remove any existing resizers
        container.querySelectorAll('.resizer').forEach(r => r.remove());
        
        // Add resizers based on layout type
        switch(layout) {
            case 'horizontal-50-50':
                this.addHorizontalResizer(container, 0);
                break;
            case 'vertical-50-50':
                this.addVerticalResizer(container, 0);
                break;
            case 'grid-2x2':
                // Add both horizontal and vertical resizers for grid
                this.addGridResizers(container);
                break;
            case 'two-left-one-right':
                this.addVerticalResizer(container, 0);
                // Add horizontal resizer for left column
                const leftCol = container.querySelector('.left-column');
                if (leftCol) {
                    this.addHorizontalResizer(leftCol, 0);
                }
                break;
            case 'one-left-two-right':
                this.addVerticalResizer(container, 0);
                // Add horizontal resizer for right column
                const rightCol = container.querySelector('.right-column');
                if (rightCol) {
                    this.addHorizontalResizer(rightCol, 0);
                }
                break;
            case 'three-equal':
            case 'three-focused':
                this.addVerticalResizer(container, 0);
                this.addVerticalResizer(container, 1);
                break;
        }
    }
    
    addHorizontalResizer(parent, index) {
        const resizer = document.createElement('div');
        resizer.className = 'resizer horizontal';
        resizer.dataset.index = index;
        resizer.style.position = 'absolute';
        resizer.style.left = '0';
        resizer.style.right = '0';
        resizer.style.height = '4px';
        resizer.style.top = '50%';
        resizer.style.transform = 'translateY(-2px)';
        resizer.style.cursor = 'ns-resize';
        resizer.style.zIndex = '100';
        
        parent.style.position = 'relative';
        parent.appendChild(resizer);
        
        this.makeResizable(resizer, 'horizontal', parent, index);
    }
    
    addVerticalResizer(parent, index) {
        // For mixed layouts, we need to get both columns and standalone panes
        const leftColumn = parent.querySelector('.left-column');
        const rightColumn = parent.querySelector('.right-column');
        const standalonePanes = parent.querySelectorAll(':scope > .pane');
        
        let elements = [];
        if (leftColumn || rightColumn) {
            // Mixed layout - gather all top-level elements
            if (leftColumn) elements.push(leftColumn);
            standalonePanes.forEach(pane => {
                if (!pane.parentElement.classList.contains('left-column') && 
                    !pane.parentElement.classList.contains('right-column')) {
                    elements.push(pane);
                }
            });
            if (rightColumn) elements.push(rightColumn);
        } else {
            // Simple layout - just panes
            elements = Array.from(standalonePanes);
        }
        
        if (elements.length <= index + 1) return;
        
        const resizer = document.createElement('div');
        resizer.className = 'resizer vertical';
        resizer.dataset.index = index; // Track which resizer this is
        resizer.style.position = 'absolute';
        resizer.style.top = '0';
        resizer.style.bottom = '0';
        resizer.style.width = '4px';
        resizer.style.cursor = 'ew-resize';
        resizer.style.zIndex = '100';
        
        parent.style.position = 'relative';
        
        // Calculate initial position - need to sum up widths for multiple panes
        let leftOffset = 0;
        for (let i = 0; i <= index; i++) {
            if (elements[i]) {
                leftOffset += elements[i].offsetWidth;
            }
        }
        resizer.style.left = `${leftOffset}px`;
        
        parent.appendChild(resizer);
        
        this.makeResizable(resizer, 'vertical', parent, index);
    }
    
    addGridResizers(container) {
        container.style.position = 'relative';
        
        // Add horizontal bar for vertical resizing
        const horizontalResizer = document.createElement('div');
        horizontalResizer.className = 'resizer horizontal grid-horizontal';
        horizontalResizer.style.position = 'absolute';
        horizontalResizer.style.left = '0';
        horizontalResizer.style.right = '0';
        horizontalResizer.style.height = '4px';
        horizontalResizer.style.top = '50%';
        horizontalResizer.style.transform = 'translateY(-2px)';
        horizontalResizer.style.cursor = 'ns-resize';
        horizontalResizer.style.zIndex = '100';
        container.appendChild(horizontalResizer);
        
        // Add vertical bar for horizontal resizing
        const verticalResizer = document.createElement('div');
        verticalResizer.className = 'resizer vertical grid-vertical';
        verticalResizer.style.position = 'absolute';
        verticalResizer.style.top = '0';
        verticalResizer.style.bottom = '0';
        verticalResizer.style.width = '4px';
        verticalResizer.style.left = '50%';
        verticalResizer.style.transform = 'translateX(-2px)';
        verticalResizer.style.cursor = 'ew-resize';
        verticalResizer.style.zIndex = '100';
        container.appendChild(verticalResizer);
        
        // Add center dot for omnidirectional resizing
        const centerResizer = document.createElement('div');
        centerResizer.className = 'resizer center';
        centerResizer.style.position = 'absolute';
        centerResizer.style.width = '12px';
        centerResizer.style.height = '12px';
        centerResizer.style.left = '50%';
        centerResizer.style.top = '50%';
        centerResizer.style.transform = 'translate(-50%, -50%)';
        centerResizer.style.background = '#4a9eff';
        centerResizer.style.borderRadius = '50%';
        centerResizer.style.cursor = 'move';
        centerResizer.style.zIndex = '102'; // Higher than the bars
        centerResizer.style.border = '2px solid #1a1a1a';
        container.appendChild(centerResizer);
        
        // Make the bars resizable
        this.makeGridBarResizable(horizontalResizer, 'horizontal', container);
        this.makeGridBarResizable(verticalResizer, 'vertical', container);
        
        // Make the center dot resizable for both directions
        this.makeGridResizable(centerResizer, container);
    }
    
    makeResizable(resizer, direction, parent, resizerIndex = 0) {
        let isResizing = false;
        let startPos = 0;
        let startSizes = [];
        
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startPos = direction === 'horizontal' ? e.clientY : e.clientX;
            
            // Get initial sizes - handle mixed layouts properly
            let elements = [];
            if (direction === 'vertical') {
                const leftColumn = parent.querySelector('.left-column');
                const rightColumn = parent.querySelector('.right-column');
                const standalonePanes = parent.querySelectorAll(':scope > .pane');
                
                if (leftColumn || rightColumn) {
                    // Mixed layout
                    if (leftColumn) elements.push(leftColumn);
                    standalonePanes.forEach(pane => {
                        if (!pane.parentElement.classList.contains('left-column') && 
                            !pane.parentElement.classList.contains('right-column')) {
                            elements.push(pane);
                        }
                    });
                    if (rightColumn) elements.push(rightColumn);
                } else {
                    // Simple layout
                    elements = Array.from(standalonePanes);
                }
            } else {
                // Horizontal resizing - just get direct children panes
                const panes = parent.querySelectorAll(':scope > .pane');
                elements = Array.from(panes);
            }
            
            startSizes = Array.from(elements).map(el => {
                return direction === 'horizontal' 
                    ? el.offsetHeight 
                    : el.offsetWidth;
            });
            
            // Create overlay to capture all mouse events
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '9999';
            overlay.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize';
            document.body.appendChild(overlay);
            
            const handleMouseMove = (e) => {
                const currentPos = direction === 'horizontal' ? e.clientY : e.clientX;
                const diff = currentPos - startPos;
                
                // Get elements - handle mixed layouts properly
                let elements = [];
                if (direction === 'vertical') {
                    const leftColumn = parent.querySelector('.left-column');
                    const rightColumn = parent.querySelector('.right-column');
                    const standalonePanes = parent.querySelectorAll(':scope > .pane');
                    
                    if (leftColumn || rightColumn) {
                        // Mixed layout
                        if (leftColumn) elements.push(leftColumn);
                        standalonePanes.forEach(pane => {
                            if (!pane.parentElement.classList.contains('left-column') && 
                                !pane.parentElement.classList.contains('right-column')) {
                                elements.push(pane);
                            }
                        });
                        if (rightColumn) elements.push(rightColumn);
                    } else {
                        // Simple layout
                        elements = Array.from(standalonePanes);
                    }
                } else {
                    // Horizontal resizing - just get direct children panes
                    const panes = parent.querySelectorAll(':scope > .pane');
                    elements = Array.from(panes);
                }
                
                if (elements.length >= 2) {
                    const totalSize = direction === 'horizontal' 
                        ? parent.offsetHeight 
                        : parent.offsetWidth;
                    
                    if (direction === 'horizontal') {
                        // Horizontal resizing
                        const firstSize = startSizes[0] + diff;
                        const firstPercent = (firstSize / totalSize) * 100;
                        
                        if (firstPercent > 20 && firstPercent < 80) {
                            elements[0].style.flex = `0 0 ${firstPercent}%`;
                            elements[1].style.flex = `0 0 ${100 - firstPercent}%`;
                            // Update resizer position
                            resizer.style.top = `${firstPercent}%`;
                            resizer.style.transform = 'translateY(-2px)'; // Adjust for resizer height
                        }
                    } else {
                        // Vertical resizing - handle based on which resizer is being dragged
                        if (elements.length === 2) {
                            // Two columns/elements (including mixed layouts)
                            const firstSize = startSizes[0] + diff;
                            const firstPercent = (firstSize / totalSize) * 100;
                            
                            if (firstPercent > 20 && firstPercent < 80) {
                                elements[0].style.flex = `0 0 ${firstPercent}%`;
                                elements[1].style.flex = `0 0 ${100 - firstPercent}%`;
                                resizer.style.left = `${firstSize}px`;
                            }
                        } else if (elements.length === 3) {
                            // Three columns - handle based on which resizer
                            if (resizerIndex === 0) {
                                // First resizer - between column 0 and 1
                                // Only affect columns 0 and 1, keep column 2 unchanged
                                const firstSize = startSizes[0] + diff;
                                const combinedFirstTwo = startSizes[0] + startSizes[1];
                                const firstPercent = (firstSize / totalSize) * 100;
                                const secondPercent = ((combinedFirstTwo - firstSize) / totalSize) * 100;
                                const thirdPercent = (startSizes[2] / totalSize) * 100;
                                
                                // Check boundaries - first column between 15-70%, second column at least 15%
                                if (firstPercent > 15 && firstPercent < 70 && secondPercent > 15) {
                                    elements[0].style.flex = `0 0 ${firstPercent}%`;
                                    elements[1].style.flex = `0 0 ${secondPercent}%`;
                                    elements[2].style.flex = `0 0 ${thirdPercent}%`;
                                    resizer.style.left = `${firstSize}px`;
                                    
                                    // Keep second resizer in its position (don't move it)
                                    const secondResizer = parent.querySelector('.resizer.vertical[data-index="1"]');
                                    if (secondResizer) {
                                        secondResizer.style.left = `${firstSize + elements[1].offsetWidth}px`;
                                    }
                                }
                            } else if (resizerIndex === 1) {
                                // Second resizer - between column 1 and 2
                                // Only affect columns 1 and 2, keep column 0 unchanged
                                const firstPercent = (startSizes[0] / totalSize) * 100;
                                const middleStart = startSizes[0];
                                const middleEnd = startSizes[0] + startSizes[1] + diff;
                                const secondPercent = ((middleEnd - middleStart) / totalSize) * 100;
                                const thirdPercent = ((totalSize - middleEnd) / totalSize) * 100;
                                
                                // Check boundaries - second column at least 15%, third column at least 15%
                                if (secondPercent > 15 && thirdPercent > 15) {
                                    elements[0].style.flex = `0 0 ${firstPercent}%`;
                                    elements[1].style.flex = `0 0 ${secondPercent}%`;
                                    elements[2].style.flex = `0 0 ${thirdPercent}%`;
                                    resizer.style.left = `${middleEnd}px`;
                                    
                                    // First resizer stays in place
                                    const firstResizer = parent.querySelector('.resizer.vertical[data-index="0"]');
                                    if (firstResizer) {
                                        firstResizer.style.left = `${startSizes[0]}px`;
                                    }
                                }
                            }
                        }
                    }
                }
            };
            
            const handleMouseUp = () => {
                isResizing = false;
                document.body.removeChild(overlay);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                
                // Update resizer positions after resize completes
                if (direction === 'vertical' && elements.length === 3) {
                    setTimeout(() => {
                        const resizers = parent.querySelectorAll('.resizer.vertical');
                        resizers.forEach((r, idx) => {
                            let offset = 0;
                            for (let i = 0; i <= idx; i++) {
                                if (elements[i]) {
                                    offset += elements[i].offsetWidth;
                                }
                            }
                            r.style.left = `${offset}px`;
                        });
                    }, 10);
                } else if (direction === 'horizontal') {
                    // Ensure horizontal resizer stays in correct position
                    setTimeout(() => {
                        const panes = parent.querySelectorAll(':scope > .pane');
                        if (panes.length === 2 && panes[0]) {
                            const firstHeight = panes[0].offsetHeight;
                            const totalHeight = parent.offsetHeight;
                            const percent = (firstHeight / totalHeight) * 100;
                            resizer.style.top = `${percent}%`;
                            resizer.style.transform = 'translateY(-2px)';
                        }
                    }, 10);
                }
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            e.preventDefault();
        });
    }
    
    makeGridBarResizable(resizer, direction, container) {
        let isResizing = false;
        let startPos = 0;
        
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startPos = direction === 'horizontal' ? e.clientY : e.clientX;
            
            // Create overlay to capture all mouse events
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '9999';
            overlay.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize';
            document.body.appendChild(overlay);
            
            const handleMouseMove = (e) => {
                const rect = container.getBoundingClientRect();
                
                if (direction === 'horizontal') {
                    // Only adjust vertical position (rows)
                    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    if (yPercent > 20 && yPercent < 80) {
                        container.style.gridTemplateRows = `${yPercent}% ${100 - yPercent}%`;
                        resizer.style.top = `${yPercent}%`;
                        
                        // Update center dot position
                        const centerDot = container.querySelector('.resizer.center');
                        if (centerDot) {
                            centerDot.style.top = `${yPercent}%`;
                        }
                        
                        // Update vertical bar if it exists
                        const verticalBar = container.querySelector('.resizer.grid-vertical');
                        if (verticalBar) {
                            const currentCols = container.style.gridTemplateColumns || '50% 50%';
                            const xPercent = parseFloat(currentCols.split('%')[0]) || 50;
                            verticalBar.style.left = `${xPercent}%`;
                        }
                    }
                } else {
                    // Only adjust horizontal position (columns)
                    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
                    
                    if (xPercent > 20 && xPercent < 80) {
                        container.style.gridTemplateColumns = `${xPercent}% ${100 - xPercent}%`;
                        resizer.style.left = `${xPercent}%`;
                        
                        // Update center dot position
                        const centerDot = container.querySelector('.resizer.center');
                        if (centerDot) {
                            centerDot.style.left = `${xPercent}%`;
                        }
                    }
                }
            };
            
            const handleMouseUp = () => {
                isResizing = false;
                document.body.removeChild(overlay);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            e.preventDefault();
            e.stopPropagation(); // Prevent center dot from also triggering
        });
    }
    
    makeGridResizable(resizer, container) {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // Create overlay to capture all mouse events
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '9999';
            overlay.style.cursor = 'move';
            document.body.appendChild(overlay);
            
            const handleMouseMove = (e) => {
                const rect = container.getBoundingClientRect();
                const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
                const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
                
                if (xPercent > 20 && xPercent < 80 && yPercent > 20 && yPercent < 80) {
                    container.style.gridTemplateColumns = `${xPercent}% ${100 - xPercent}%`;
                    container.style.gridTemplateRows = `${yPercent}% ${100 - yPercent}%`;
                    
                    resizer.style.left = `${xPercent}%`;
                    resizer.style.top = `${yPercent}%`;
                    
                    // Update the bar positions too
                    const horizontalBar = container.querySelector('.resizer.grid-horizontal');
                    if (horizontalBar) {
                        horizontalBar.style.top = `${yPercent}%`;
                    }
                    
                    const verticalBar = container.querySelector('.resizer.grid-vertical');
                    if (verticalBar) {
                        verticalBar.style.left = `${xPercent}%`;
                    }
                }
            };
            
            const handleMouseUp = () => {
                isResizing = false;
                document.body.removeChild(overlay);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            e.preventDefault();
        });
    }

}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new MultiPaneBrowser();
});