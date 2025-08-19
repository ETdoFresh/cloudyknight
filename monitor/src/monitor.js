import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { DockerManager } from './docker-manager.js';
import { ProjectDetector } from './project-detector.js';
// Compose generation removed - workspaces provide their own docker-compose.yml
import { logger } from './logger.js';

export class WorkspaceMonitor extends EventEmitter {
    constructor(config) {
        super();
        this.workspacePath = config.workspacePath;
        this.domain = config.domain;
        this.network = config.network;
        this.scanInterval = config.scanInterval || 30000;
        this.dockerManager = new DockerManager();
        this.projectDetector = new ProjectDetector();
        // Monitor now only detects existing docker-compose files
        this.watcher = null;
        this.scanTimer = null;
        this.projects = new Map();
    }
    
    async start() {
        logger.info('Initializing workspace monitor...');
        
        // Initial scan
        await this.scanWorkspace();
        
        // Set up file watcher
        this.setupWatcher();
        
        // Set up periodic scanning
        this.scanTimer = setInterval(() => {
            this.scanWorkspace();
        }, this.scanInterval);
    }
    
    async stop() {
        if (this.watcher) {
            await this.watcher.close();
        }
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
        }
    }
    
    setupWatcher() {
        this.watcher = chokidar.watch(this.workspacePath, {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/build/**',
                '**/*.log',
                `${this.workspacePath}/monitor/**` // Ignore monitor directory
            ],
            persistent: true,
            depth: 2, // Only watch workspace and immediate subdirectories
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });
        
        this.watcher
            .on('add', filepath => this.handleFileChange(filepath, 'added'))
            .on('change', filepath => this.handleFileChange(filepath, 'changed'))
            .on('unlink', filepath => this.handleFileChange(filepath, 'removed'));
    }
    
    async handleFileChange(filepath, event) {
        // Check if this is a project file that matters
        const projectFiles = ['package.json', 'docker-compose.yml', 'Dockerfile', 'index.html'];
        const filename = path.basename(filepath);
        
        if (projectFiles.includes(filename)) {
            logger.info(`Project file ${event}: ${filepath}`);
            const dir = path.dirname(filepath);
            
            // Only process if this is a direct subdirectory of workspaces
            const relativePath = path.relative(this.workspacePath, dir);
            const pathParts = relativePath.split(path.sep);
            
            // Skip if not a direct subdirectory (has subdirectories) or is monitor
            if (pathParts.length !== 1 || pathParts[0] === 'monitor') {
                return;
            }
            
            const projectName = pathParts[0];
            
            // Debounce and rescan this specific project
            setTimeout(() => {
                this.scanProject(dir, projectName);
            }, 1000);
        }
    }
    
    async scanWorkspace() {
        try {
            logger.info('Scanning workspace for projects...');
            const entries = await fs.readdir(this.workspacePath, { withFileTypes: true });
            
            for (const entry of entries) {
                // Only scan top-level directories, not subdirectories
                if (entry.isDirectory() && entry.name !== 'monitor' && !entry.name.startsWith('.')) {
                    const projectPath = path.join(this.workspacePath, entry.name);
                    await this.scanProject(projectPath, entry.name);
                }
            }
            
            logger.info(`Scan complete. Found ${this.projects.size} projects`);
        } catch (error) {
            logger.error('Error scanning workspace:', error);
        }
    }
    
    async scanProject(projectPath, projectName) {
        try {
            const projectInfo = await this.projectDetector.detectProject(projectPath);
            
            if (projectInfo) {
                logger.info(`Detected ${projectInfo.type} project: ${projectName}`);
                
                // Store project info
                this.projects.set(projectName, {
                    ...projectInfo,
                    name: projectName,
                    path: projectPath
                });
                
                // Check if docker-compose.yml exists
                const composePath = path.join(projectPath, 'docker-compose.yml');
                const hasCompose = await fs.access(composePath).then(() => true).catch(() => false);
                
                if (hasCompose) {
                    logger.info(`Found docker-compose.yml for ${projectName}`);
                    // Manage Docker container
                    await this.manageContainer(projectName, projectInfo);
                } else {
                    logger.warn(`No docker-compose.yml found for ${projectName}, skipping container management`);
                }
            }
        } catch (error) {
            logger.error(`Error scanning project ${projectName}:`, error);
        }
    }
    
    // Removed ensureDockerCompose - workspaces must provide their own docker-compose.yml
    
    async manageContainer(projectName, projectInfo) {
        try {
            const containerName = `workspace-${projectName}`;
            const isRunning = await this.dockerManager.isContainerRunning(containerName);
            
            if (!isRunning) {
                logger.info(`Starting container for ${projectName}`);
                await this.dockerManager.startProject(projectInfo.path, projectName);
            } else {
                // Check if container needs restart (config changed, etc.)
                const needsRestart = await this.dockerManager.checkIfRestartNeeded(containerName, projectInfo);
                if (needsRestart) {
                    logger.info(`Restarting container for ${projectName}`);
                    await this.dockerManager.restartProject(projectInfo.path, projectName);
                }
            }
        } catch (error) {
            logger.error(`Error managing container for ${projectName}:`, error);
        }
    }
}