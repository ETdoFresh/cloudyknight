import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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

// Database configuration
const getDbConfig = () => {
    if (process.env.NODE_ENV === 'production') {
        // Production - using Dokploy container
        return {
            host: 'workspaces-postgresql-j6qubz',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: 'cunoj2awh6a6trsi'
        };
    } else {
        // Local development - using EHUB2023
        return {
            host: process.env.DB_HOST || 'EHUB2023',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'cunoj2awh6a6trsi'
        };
    }
};

// Create PostgreSQL pool
const { Pool } = pg;
const pool = new Pool(getDbConfig());

// Test database connection on startup
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Failed to connect to PostgreSQL:', err.message);
        console.log('📌 Database config:', {
            host: getDbConfig().host,
            port: getDbConfig().port,
            database: getDbConfig().database,
            user: getDbConfig().user
        });
    } else {
        console.log('✅ Connected to PostgreSQL at', res.rows[0].now);
    }
});

// Helper functions
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Template generation functions (keeping these as they are for file operations)
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
        const result = await pool.query(
            'SELECT * FROM workspaces ORDER BY created ASC'
        );
        
        // Get metadata
        const metaResult = await pool.query(
            "SELECT key, value FROM workspace_metadata WHERE key IN ('version', 'lastModified')"
        );
        
        const metadata = {};
        metaResult.rows.forEach(row => {
            metadata[row.key] = row.value;
        });
        
        res.json({
            workspaces: result.rows,
            lastModified: metadata.lastModified || new Date().toISOString(),
            version: metadata.version || '1.0.0'
        });
    } catch (error) {
        console.error('Error fetching workspaces:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET single workspace
router.get('/workspaces/:slug', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM workspaces WHERE slug = $1',
            [req.params.slug]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching workspace:', error);
        res.status(500).json({ error: error.message });
    }
});

// CREATE new workspace
router.post('/workspaces', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { slug, name, icon, description, status, type } = req.body;
        
        // Validate required fields
        if (!slug || !name) {
            return res.status(400).json({ error: 'Slug and name are required' });
        }
        
        // Start transaction
        await client.query('BEGIN');
        
        // Check if slug already exists
        const existingResult = await client.query(
            'SELECT id FROM workspaces WHERE slug = $1',
            [slug]
        );
        
        if (existingResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Workspace with this slug already exists' });
        }
        
        // Insert workspace into database
        const insertResult = await client.query(
            `INSERT INTO workspaces (id, slug, name, icon, description, status, type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                slug, // using slug as id for simplicity
                slug,
                name,
                icon || '📁',
                description || '',
                status || 'active',
                type || 'static'
            ]
        );
        
        const newWorkspace = insertResult.rows[0];
        
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
        
        // Commit transaction
        await client.query('COMMIT');
        
        // Update lastModified metadata
        await pool.query(
            `INSERT INTO workspace_metadata (key, value) 
             VALUES ('lastModified', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [new Date().toISOString()]
        );
        
        res.status(201).json(newWorkspace);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating workspace:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// UPDATE workspace
router.put('/workspaces/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const updates = req.body;
        
        // Build dynamic UPDATE query
        const updateFields = [];
        const values = [];
        let paramCount = 1;
        
        // Allowed fields to update
        const allowedFields = ['name', 'icon', 'description', 'status', 'type'];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = $${paramCount}`);
                values.push(updates[field]);
                paramCount++;
            }
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        // Add slug for WHERE clause
        values.push(slug);
        
        const query = `
            UPDATE workspaces 
            SET ${updateFields.join(', ')}, modified = CURRENT_TIMESTAMP
            WHERE slug = $${paramCount}
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Update lastModified metadata
        await pool.query(
            `INSERT INTO workspace_metadata (key, value) 
             VALUES ('lastModified', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [new Date().toISOString()]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating workspace:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE workspace
router.delete('/workspaces/:slug', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM workspaces WHERE slug = $1 RETURNING *',
            [req.params.slug]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Update lastModified metadata
        await pool.query(
            `INSERT INTO workspace_metadata (key, value) 
             VALUES ('lastModified', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [new Date().toISOString()]
        );
        
        // Note: Not deleting the actual directory for safety
        // In production, you might want to move it to a trash folder
        
        res.json({ message: 'Workspace deleted successfully', workspace: result.rows[0] });
    } catch (error) {
        console.error('Error deleting workspace:', error);
        res.status(500).json({ error: error.message });
    }
});

// Docker operations (keeping as-is since they interact with filesystem)
router.post('/workspaces/:slug/docker/:action', async (req, res) => {
    try {
        const { slug, action } = req.params;
        const workspacePath = path.join(WORKSPACES_ROOT, slug);
        
        // Check if workspace exists in database
        const result = await pool.query(
            'SELECT id FROM workspaces WHERE slug = $1',
            [slug]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Check if workspace directory exists
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

// Command execution endpoint for workspaces (keeping as-is)
router.post('/workspaces/:slug/execute', async (req, res) => {
    try {
        const { slug } = req.params;
        const { command, cwd = '.' } = req.body;
        
        // Validate inputs
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }
        
        // Check if workspace exists in database
        const result = await pool.query(
            'SELECT id FROM workspaces WHERE slug = $1',
            [slug]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        
        // Construct the working directory path
        const workspacePath = path.join(WORKSPACES_ROOT, slug);
        const fullCwd = path.resolve(workspacePath, cwd);
        
        // Security: Ensure the working directory is within the workspace
        if (!fullCwd.startsWith(workspacePath)) {
            return res.status(403).json({ error: 'Access denied: Path outside workspace' });
        }
        
        // Security: Basic command filtering
        const dangerousPatterns = [
            /\brm\s+-rf\s+\//,
            /\bdd\s+if=/,
            /\bmkfs\b/,
            /\bfdisk\b/,
            /\bshutdown\b/,
            /\breboot\b/,
            /\b(systemctl|service)\s+(stop|restart|disable).*ssh/,
            /\bchmod\s+777\s+\//,
            /\b:\(\)\s*\{\s*:\|\s*:\s*&\s*\};\s*:/
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
                    if (error.killed && error.signal === 'SIGTERM') {
                        reject(new Error('Command execution timed out'));
                    } else {
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
        
        const execResult = await executeWithTimeout;
        
        res.json({
            workspace: slug,
            command: command,
            cwd: cwd,
            result: execResult
        });
        
    } catch (error) {
        console.error('Command execution error:', error);
        res.status(500).json({ 
            error: error.message,
            workspace: req.params.slug
        });
    }
});

// Database setup endpoint (REMOVE IN PRODUCTION AFTER SETUP!)
router.post('/setup-database', async (req, res) => {
    try {
        console.log('Starting database setup...');
        
        // Create schema
        const schemaSQL = `
-- Workspaces table schema
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(10) DEFAULT '📁',
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    type VARCHAR(50) DEFAULT 'static' CHECK (type IN ('static', 'nodejs', 'python', 'php', 'custom', 'external')),
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_workspaces_modified 
    BEFORE UPDATE ON workspaces 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

-- Metadata table
CREATE TABLE IF NOT EXISTS workspace_metadata (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;
        
        await pool.query(schemaSQL);
        
        // Check if already has data
        const countResult = await pool.query('SELECT COUNT(*) FROM workspaces');
        const existingCount = parseInt(countResult.rows[0].count);
        
        res.json({ 
            message: 'Database setup complete', 
            tablesCreated: true,
            existingWorkspaces: existingCount
        });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check with database status
router.get('/health', async (req, res) => {
    try {
        // Check database connection
        const dbResult = await pool.query('SELECT NOW()');
        const workspaceCount = await pool.query('SELECT COUNT(*) FROM workspaces');
        
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                time: dbResult.rows[0].now,
                workspaces: parseInt(workspaceCount.rows[0].count)
            }
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy', 
            timestamp: new Date().toISOString(),
            database: {
                connected: false,
                error: error.message
            }
        });
    }
});

// Mount the router at /api/v1
app.use('/api/v1', router);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing database pool...');
    await pool.end();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Workspaces API (PostgreSQL) running on http://localhost:${PORT}`);
    console.log(`📍 Database: ${getDbConfig().host}:${getDbConfig().port}`);
    console.log(`📍 Endpoints:`);
    console.log(`   GET    /api/v1/workspaces           - List all workspaces`);
    console.log(`   GET    /api/v1/workspaces/:slug     - Get single workspace`);
    console.log(`   POST   /api/v1/workspaces           - Create new workspace`);
    console.log(`   PUT    /api/v1/workspaces/:slug     - Update workspace`);
    console.log(`   DELETE /api/v1/workspaces/:slug     - Delete workspace`);
    console.log(`   POST   /api/v1/workspaces/:slug/docker/:action - Docker operations`);
    console.log(`   POST   /api/v1/workspaces/:slug/execute - Execute commands`);
    console.log(`   GET    /api/v1/health                - Health check with DB status`);
});