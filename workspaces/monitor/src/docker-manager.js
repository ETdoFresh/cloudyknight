import { spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(spawn);

export class DockerManager {
    constructor() {
        this.dockerCommand = 'docker';
        this.composeCommand = 'docker-compose';
    }
    
    async isContainerRunning(containerName) {
        try {
            const result = await this.exec(['docker', 'ps', '--format', '{{.Names}}']);
            const runningContainers = result.split('\n').filter(Boolean);
            return runningContainers.includes(containerName);
        } catch (error) {
            logger.error(`Error checking container status for ${containerName}:`, error);
            return false;
        }
    }
    
    async startProject(projectPath, projectName) {
        try {
            logger.info(`Starting project ${projectName} at ${projectPath}`);
            
            // Run docker-compose up -d in the project directory
            const result = await this.execInDir(projectPath, ['docker-compose', 'up', '-d', '--build']);
            
            if (result.includes('error') || result.includes('Error')) {
                throw new Error(`Failed to start project: ${result}`);
            }
            
            logger.info(`Successfully started ${projectName}`);
            return true;
        } catch (error) {
            logger.error(`Error starting project ${projectName}:`, error);
            return false;
        }
    }
    
    async restartProject(projectPath, projectName) {
        try {
            logger.info(`Restarting project ${projectName}`);
            
            // Stop the project first
            await this.execInDir(projectPath, ['docker-compose', 'down']);
            
            // Then start it again
            await this.startProject(projectPath, projectName);
            
            return true;
        } catch (error) {
            logger.error(`Error restarting project ${projectName}:`, error);
            return false;
        }
    }
    
    async stopProject(projectPath, projectName) {
        try {
            logger.info(`Stopping project ${projectName}`);
            
            const result = await this.execInDir(projectPath, ['docker-compose', 'down']);
            
            logger.info(`Successfully stopped ${projectName}`);
            return true;
        } catch (error) {
            logger.error(`Error stopping project ${projectName}:`, error);
            return false;
        }
    }
    
    async checkIfRestartNeeded(containerName, projectInfo) {
        try {
            // Get container's last modified time
            const inspectResult = await this.exec([
                'docker', 'inspect', containerName, 
                '--format', '{{.State.StartedAt}}'
            ]);
            
            if (!inspectResult) {
                return true; // Container doesn't exist, needs start
            }
            
            const containerStartTime = new Date(inspectResult.trim());
            
            // Check if compose file was modified after container start
            const fs = await import('fs/promises');
            const composePath = `${projectInfo.path}/docker-compose.yml`;
            
            try {
                const stats = await fs.stat(composePath);
                const composeModifiedTime = stats.mtime;
                
                // If compose file is newer than container start, restart needed
                if (composeModifiedTime > containerStartTime) {
                    logger.info(`Compose file modified for ${containerName}, restart needed`);
                    return true;
                }
            } catch (error) {
                // Compose file doesn't exist or can't be read
                logger.debug(`Cannot check compose file for ${containerName}:`, error.message);
            }
            
            return false;
            
        } catch (error) {
            logger.error(`Error checking restart status for ${containerName}:`, error);
            return false;
        }
    }
    
    async getContainerLogs(containerName, lines = 50) {
        try {
            const result = await this.exec([
                'docker', 'logs', '--tail', lines.toString(), containerName
            ]);
            return result;
        } catch (error) {
            logger.error(`Error getting logs for ${containerName}:`, error);
            return '';
        }
    }
    
    exec(args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(args[0], args.slice(1));
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || stdout));
                }
            });
            
            proc.on('error', (error) => {
                reject(error);
            });
        });
    }
    
    execInDir(dir, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(args[0], args.slice(1), { cwd: dir });
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    // Some docker-compose commands return non-zero even on success
                    if (stderr.includes('Stopping') || stderr.includes('Removing')) {
                        resolve(stderr);
                    } else {
                        reject(new Error(stderr || stdout));
                    }
                }
            });
            
            proc.on('error', (error) => {
                reject(error);
            });
        });
    }
}