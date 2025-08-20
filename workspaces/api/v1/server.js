import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Paths - Use absolute paths that work in container
const WORKSPACES_ROOT = '/workspaces';
const WORKSPACES_JSON = '/workspaces/admin/workspaces.json';

// Helper functions
async function loadWorkspaces() {
    try {
        const data = await fs.readFile(WORKSPACES_JSON, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Return default workspaces if file doesn't exist
        return {
            workspaces: [],
            lastModified: new Date().toISOString(),
            version: "1.0.0"
        };
    }
}

async function saveWorkspaces(data) {
    const jsonData = {
        ...data,
        lastModified: new Date().toISOString()
    };
    await fs.writeFile(WORKSPACES_JSON, JSON.stringify(jsonData, null, 2));
    return jsonData;
}

async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Template generation functions
function getDockerCompose(slug, type) {
    const templates = {
        nodejs: `version: '3.8'

services:
  ${slug}:
    container_name: ${slug}
    image: node:18-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: npx vite --host 0.0.0.0 --port 3000
    restart: unless-stopped
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-network"
      - "traefik.http.routers.${slug}.rule=Host(\`workspaces.etdofresh.com\`) && PathPrefix(\`/${slug}\`)"
      - "traefik.http.routers.${slug}.entrypoints=websecure"
      - "traefik.http.routers.${slug}.tls=true"
      - "traefik.http.routers.${slug}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${slug}.priority=50"
      - "traefik.http.services.${slug}.loadbalancer.server.port=3000"

networks:
  traefik-network:
    external: true`,

        static: `version: '3.8'

services:
  ${slug}:
    container_name: ${slug}
    image: nginx:alpine
    volumes:
      - .:/usr/share/nginx/html:ro
    restart: unless-stopped
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-network"
      - "traefik.http.routers.${slug}.rule=Host(\`workspaces.etdofresh.com\`) && PathPrefix(\`/${slug}\`)"
      - "traefik.http.routers.${slug}.entrypoints=websecure"
      - "traefik.http.routers.${slug}.tls=true"
      - "traefik.http.routers.${slug}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${slug}.priority=50"
      - "traefik.http.services.${slug}.loadbalancer.server.port=80"

networks:
  traefik-network:
    external: true`,

        python: `version: '3.8'

services:
  ${slug}:
    container_name: ${slug}
    build: .
    volumes:
      - .:/app
    restart: unless-stopped
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-network"
      - "traefik.http.routers.${slug}.rule=Host(\`workspaces.etdofresh.com\`) && PathPrefix(\`/${slug}\`)"
      - "traefik.http.routers.${slug}.entrypoints=websecure"
      - "traefik.http.routers.${slug}.tls=true"
      - "traefik.http.routers.${slug}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${slug}.priority=50"
      - "traefik.http.services.${slug}.loadbalancer.server.port=5000"

networks:
  traefik-network:
    external: true`,

        php: `version: '3.8'

services:
  ${slug}:
    container_name: ${slug}
    image: php:8.2-apache
    volumes:
      - .:/var/www/html
    restart: unless-stopped
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-network"
      - "traefik.http.routers.${slug}.rule=Host(\`workspaces.etdofresh.com\`) && PathPrefix(\`/${slug}\`)"
      - "traefik.http.routers.${slug}.entrypoints=websecure"
      - "traefik.http.routers.${slug}.tls=true"
      - "traefik.http.routers.${slug}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${slug}.priority=50"
      - "traefik.http.services.${slug}.loadbalancer.server.port=80"

networks:
  traefik-network:
    external: true`,

        custom: `version: '3.8'

services:
  ${slug}:
    container_name: ${slug}
    # Configure your custom image and settings here
    image: alpine:latest
    command: tail -f /dev/null
    restart: unless-stopped
    networks:
      - traefik-network

networks:
  traefik-network:
    external: true`
    };

    return templates[type] || templates.custom;
}

function getIndexFile(slug, type) {
    const templates = {
        nodejs: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${slug} - Workspace</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        p { font-size: 1.2rem; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ${slug}</h1>
        <p>Your Node.js workspace is ready!</p>
        <p>Edit this file to start building your application.</p>
    </div>
</body>
</html>`,

        static: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${slug} - Static Site</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        p { font-size: 1.2rem; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📄 ${slug}</h1>
        <p>Your static site is ready!</p>
        <p>Add your HTML, CSS, and JavaScript files here.</p>
    </div>
</body>
</html>`,

        python: `from flask import Flask, render_template_string

app = Flask(__name__)

@app.route('/')
def home():
    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
        <title>${slug} - Python App</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
                color: white;
            }
            .container { text-align: center; padding: 2rem; }
            h1 { font-size: 3rem; margin-bottom: 1rem; }
            p { font-size: 1.2rem; opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🐍 ${slug}</h1>
            <p>Your Python Flask app is running!</p>
            <p>Edit app.py to build your application.</p>
        </div>
    </body>
    </html>
    ''')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)`,

        php: `<?php
// ${slug} - PHP Workspace
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${slug} - PHP App</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
            color: white;
        }
        .container { text-align: center; padding: 2rem; }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        p { font-size: 1.2rem; opacity: 0.9; }
        .info { 
            background: rgba(255,255,255,0.1); 
            padding: 1rem; 
            border-radius: 8px; 
            margin-top: 2rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🐘 ${slug}</h1>
        <p>Your PHP workspace is running!</p>
        <div class="info">
            <p>PHP Version: <?php echo phpversion(); ?></p>
            <p>Server: <?php echo $_SERVER['SERVER_SOFTWARE'] ?? 'Apache'; ?></p>
        </div>
    </div>
</body>
</html>`
    };

    return templates[type] || templates.static;
}

// API Routes
const router = express.Router();

// GET all workspaces
router.get('/workspaces', async (req, res) => {
    try {
        const data = await loadWorkspaces();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET single workspace
router.get('/workspaces/:slug', async (req, res) => {
    try {
        const data = await loadWorkspaces();
        const workspace = data.workspaces.find(w => w.slug === req.params.slug);
        
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        res.json(workspace);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE new workspace
router.post('/workspaces', async (req, res) => {
    try {
        const { slug, name, icon, description, status, type } = req.body;
        
        // Validate required fields
        if (!slug || !name) {
            return res.status(400).json({ error: 'Slug and name are required' });
        }
        
        // Load existing workspaces
        const data = await loadWorkspaces();
        
        // Check if slug already exists
        if (data.workspaces.find(w => w.slug === slug)) {
            return res.status(409).json({ error: 'Workspace with this slug already exists' });
        }
        
        // Create workspace object
        const newWorkspace = {
            id: slug,
            slug,
            name,
            icon: icon || '📁',
            description: description || '',
            status: status || 'active',
            type: type || 'static',
            created: new Date().toISOString()
        };
        
        // Create workspace directory
        const workspacePath = path.join(WORKSPACES_ROOT, slug);
        await ensureDirectoryExists(workspacePath);
        
        // Create docker-compose.yml
        const dockerCompose = getDockerCompose(slug, type);
        await fs.writeFile(path.join(workspacePath, 'docker-compose.yml'), dockerCompose);
        
        // Create index file based on type
        let indexFile;
        let indexFileName;
        
        switch (type) {
            case 'python':
                indexFile = getIndexFile(slug, 'python');
                indexFileName = 'app.py';
                // Also create requirements.txt
                await fs.writeFile(
                    path.join(workspacePath, 'requirements.txt'),
                    'flask==3.0.0\ngunicorn==21.2.0'
                );
                // Create Dockerfile for Python
                await fs.writeFile(
                    path.join(workspacePath, 'Dockerfile'),
                    `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "app.py"]`
                );
                break;
            case 'php':
                indexFile = getIndexFile(slug, 'php');
                indexFileName = 'index.php';
                break;
            case 'nodejs':
                indexFile = getIndexFile(slug, 'nodejs');
                indexFileName = 'index.html';
                // Create package.json for Node.js workspace
                await fs.writeFile(
                    path.join(workspacePath, 'package.json'),
                    JSON.stringify({
                        name: slug,
                        version: "1.0.0",
                        type: "module",
                        scripts: {
                            dev: "vite --host 0.0.0.0"
                        },
                        devDependencies: {
                            vite: "^5.0.0"
                        }
                    }, null, 2)
                );
                break;
            default:
                indexFile = getIndexFile(slug, 'static');
                indexFileName = 'index.html';
        }
        
        await fs.writeFile(path.join(workspacePath, indexFileName), indexFile);
        
        // Add to workspaces list
        data.workspaces.push(newWorkspace);
        await saveWorkspaces(data);
        
        res.status(201).json(newWorkspace);
    } catch (error) {
        console.error('Error creating workspace:', error);
        res.status(500).json({ error: error.message });
    }
});

// UPDATE workspace
router.put('/workspaces/:slug', async (req, res) => {
    try {
        const data = await loadWorkspaces();
        const index = data.workspaces.findIndex(w => w.slug === req.params.slug);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Update workspace data
        data.workspaces[index] = {
            ...data.workspaces[index],
            ...req.body,
            modified: new Date().toISOString()
        };
        
        await saveWorkspaces(data);
        res.json(data.workspaces[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE workspace
router.delete('/workspaces/:slug', async (req, res) => {
    try {
        const data = await loadWorkspaces();
        const index = data.workspaces.findIndex(w => w.slug === req.params.slug);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Remove from list
        data.workspaces.splice(index, 1);
        await saveWorkspaces(data);
        
        // Note: Not deleting the actual directory for safety
        // In production, you might want to move it to a trash folder
        
        res.json({ message: 'Workspace deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Docker operations
router.post('/workspaces/:slug/docker/:action', async (req, res) => {
    try {
        const { slug, action } = req.params;
        const workspacePath = path.join(WORKSPACES_ROOT, slug);
        
        // Check if workspace exists
        await fs.access(workspacePath);
        
        // Check if docker-compose.yml exists
        const dockerComposePath = path.join(workspacePath, 'docker-compose.yml');
        try {
            await fs.access(dockerComposePath);
        } catch {
            return res.status(404).json({ error: `No docker-compose.yml found for workspace ${slug}` });
        }
        
        let command;
        switch (action) {
            case 'start':
                command = `cd ${workspacePath} && docker-compose up -d`;
                break;
            case 'stop':
                command = `cd ${workspacePath} && docker-compose down`;
                break;
            case 'restart':
                // Use || true to prevent failure if container doesn't exist
                command = `cd ${workspacePath} && docker-compose down 2>/dev/null || true && docker-compose up -d`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        
        const { stdout, stderr } = await execAsync(command);
        res.json({ 
            message: `Docker ${action} completed for ${slug}`,
            stdout,
            stderr 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Command execution endpoint for workspaces
router.post('/workspaces/:slug/execute', async (req, res) => {
    try {
        const { slug } = req.params;
        const { command, cwd = '.' } = req.body;
        
        // Validate inputs
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }
        
        // Security: Check if workspace exists
        const data = await loadWorkspaces();
        const workspace = data.workspaces.find(w => w.slug === slug);
        
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Construct the working directory path
        const workspacePath = path.join(WORKSPACES_ROOT, slug);
        const fullCwd = path.resolve(workspacePath, cwd);
        
        // Security: Ensure the working directory is within the workspace
        if (!fullCwd.startsWith(workspacePath)) {
            return res.status(403).json({ error: 'Access denied: Path outside workspace' });
        }
        
        // Security: Basic command filtering (can be enhanced)
        // Check for dangerous commands - be more specific to avoid false positives
        const dangerousPatterns = [
            /\brm\s+-rf\s+\//,     // rm -rf /
            /\bdd\s+if=/,          // dd if=
            /\bmkfs\b/,            // mkfs
            /\bfdisk\b/,           // fdisk
            /\bshutdown\b/,        // shutdown
            /\breboot\b/,          // reboot
            /\b(systemctl|service)\s+(stop|restart|disable).*ssh/,  // SSH service manipulation
            /\bchmod\s+777\s+\//,  // chmod 777 /
            /\b:\(\)\s*\{\s*:\|\s*:\s*&\s*\};\s*:/  // Fork bomb
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return res.status(403).json({ error: 'Command contains potentially dangerous operations' });
            }
        }
        
        // Security: Limit command execution time (30 seconds timeout)
        const timeout = 30000;
        
        // Execute the command with timeout
        const executeWithTimeout = new Promise((resolve, reject) => {
            const child = exec(command, {
                cwd: fullCwd,
                timeout: timeout,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            }, (error, stdout, stderr) => {
                if (error) {
                    // Check if it's a timeout
                    if (error.killed && error.signal === 'SIGTERM') {
                        reject(new Error('Command execution timed out'));
                    } else {
                        // Return error with output for debugging
                        resolve({
                            success: false,
                            error: error.message,
                            stdout: stdout || '',
                            stderr: stderr || '',
                            code: error.code
                        });
                    }
                } else {
                    resolve({
                        success: true,
                        stdout: stdout || '',
                        stderr: stderr || '',
                        code: 0
                    });
                }
            });
        });
        
        const result = await executeWithTimeout;
        
        res.json({
            workspace: slug,
            command: command,
            cwd: cwd,
            result: result
        });
        
    } catch (error) {
        console.error('Command execution error:', error);
        res.status(500).json({ 
            error: error.message,
            workspace: req.params.slug
        });
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Mount the router at /api/v1
app.use('/api/v1', router);

app.listen(PORT, () => {
    console.log(`🚀 Workspaces API running on http://localhost:${PORT}`);
    console.log(`📍 Endpoints:`);
    console.log(`   GET    /api/v1/workspaces           - List all workspaces`);
    console.log(`   GET    /api/v1/workspaces/:slug     - Get single workspace`);
    console.log(`   POST   /api/v1/workspaces           - Create new workspace`);
    console.log(`   PUT    /api/v1/workspaces/:slug     - Update workspace`);
    console.log(`   DELETE /api/v1/workspaces/:slug     - Delete workspace`);
    console.log(`   POST   /api/v1/workspaces/:slug/docker/:action - Docker operations (start/stop/restart)`);
    console.log(`   POST   /api/v1/workspaces/:slug/execute - Execute commands in workspace`);
});
