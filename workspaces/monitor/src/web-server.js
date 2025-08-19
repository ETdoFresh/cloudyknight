import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
    constructor(monitor, port = 4000) {
        this.monitor = monitor;
        this.port = port;
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.setupRoutes();
        this.setupSocketIO();
    }
    
    setupRoutes() {
        // Handle both root and /monitor paths for Traefik routing
        const basePath = process.env.BASE_PATH || '';
        
        // Explicitly serve socket.io client library
        this.app.get('/socket.io/socket.io.js', (req, res) => {
            res.sendFile(path.join(__dirname, '../node_modules/socket.io/client-dist/socket.io.js'));
        });
        
        // Serve static files
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // API endpoints
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                uptime: process.uptime(),
                projects: this.getProjectsStatus(),
                config: {
                    domain: this.monitor.domain,
                    workspacePath: this.monitor.workspacePath,
                    scanInterval: this.monitor.scanInterval
                }
            });
        });
        
        this.app.get('/api/projects', (req, res) => {
            const projects = this.getProjectsStatus();
            res.json(projects);
        });
        
        this.app.get('/api/logs', (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            res.json(this.getRecentLogs(limit));
        });
        
        this.app.get('/api/project/:name/logs', async (req, res) => {
            const projectName = req.params.name;
            const containerName = `workspace-${projectName}`;
            
            try {
                const logs = await this.monitor.dockerManager.getContainerLogs(containerName, 100);
                res.json({
                    project: projectName,
                    logs: logs.split('\n')
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });
        
        // Catch all - serve index.html for client-side routing
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });
    }
    
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            logger.info('Dashboard client connected');
            
            // Send initial status
            socket.emit('status', {
                projects: this.getProjectsStatus(),
                logs: this.getRecentLogs(50)
            });
            
            // Handle client requests
            socket.on('refresh', () => {
                socket.emit('status', {
                    projects: this.getProjectsStatus(),
                    logs: this.getRecentLogs(50)
                });
            });
            
            socket.on('project:restart', async (projectName) => {
                logger.info(`Restart requested for ${projectName}`);
                const project = this.monitor.projects.get(projectName);
                if (project) {
                    await this.monitor.manageContainer(projectName, project);
                    socket.emit('project:restarted', projectName);
                }
            });
            
            socket.on('disconnect', () => {
                logger.info('Dashboard client disconnected');
            });
        });
    }
    
    getProjectsStatus() {
        const projects = [];
        
        for (const [name, info] of this.monitor.projects) {
            const containerName = `workspace-${name}`;
            projects.push({
                name,
                type: info.type,
                framework: info.framework,
                path: info.path,
                port: info.port,
                url: name === 'www' 
                    ? `https://${this.monitor.domain}/`
                    : `https://${this.monitor.domain}/${name}`,
                container: containerName,
                status: 'unknown' // Will be updated by container check
            });
        }
        
        return projects;
    }
    
    getRecentLogs(limit = 100) {
        // This would normally read from the log file or buffer
        // For now, return a placeholder
        return [
            { timestamp: new Date().toISOString(), level: 'info', message: 'Monitor service started' },
            { timestamp: new Date().toISOString(), level: 'info', message: `Monitoring ${this.monitor.projects.size} projects` }
        ];
    }
    
    broadcastUpdate(event, data) {
        this.io.emit(event, data);
    }
    
    async start() {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                logger.info(`Web dashboard listening on port ${this.port}`);
                resolve();
            });
        });
    }
    
    async stop() {
        return new Promise((resolve) => {
            this.io.close();
            this.server.close(() => {
                logger.info('Web dashboard stopped');
                resolve();
            });
        });
    }
}