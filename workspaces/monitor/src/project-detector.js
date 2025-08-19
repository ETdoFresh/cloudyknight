import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

export class ProjectDetector {
    async detectProject(projectPath) {
        try {
            const files = await fs.readdir(projectPath);
            
            // Check for .nomonitor file
            if (files.includes('.nomonitor')) {
                logger.debug(`Skipping ${projectPath} - .nomonitor file found`);
                return null;
            }
            const projectInfo = {
                path: projectPath,
                type: null,
                hasDocker: false,
                hasPackageJson: false,
                hasIndex: false,
                port: 3000, // Default port
                command: null
            };
            
            // Check for various project indicators
            for (const file of files) {
                const filePath = path.join(projectPath, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isFile()) {
                    switch (file) {
                        case 'package.json':
                            projectInfo.hasPackageJson = true;
                            projectInfo.packageJson = await this.readPackageJson(filePath);
                            break;
                        case 'docker-compose.yml':
                        case 'docker-compose.yaml':
                            projectInfo.hasDocker = true;
                            break;
                        case 'Dockerfile':
                            projectInfo.hasDockerfile = true;
                            break;
                        case 'index.html':
                            projectInfo.hasIndex = true;
                            break;
                        case 'index.php':
                            projectInfo.hasPhp = true;
                            break;
                        case 'requirements.txt':
                        case 'setup.py':
                            projectInfo.hasPython = true;
                            break;
                        case 'Gemfile':
                            projectInfo.hasRuby = true;
                            break;
                        case 'go.mod':
                            projectInfo.hasGo = true;
                            break;
                    }
                }
            }
            
            // Determine project type and configuration
            if (projectInfo.hasPackageJson) {
                projectInfo.type = 'node';
                const pkg = projectInfo.packageJson;
                
                // Detect framework
                if (pkg.dependencies) {
                    if (pkg.dependencies.react || pkg.dependencies['react-dom']) {
                        projectInfo.framework = 'react';
                        projectInfo.port = 3000;
                        projectInfo.command = 'npm start';
                    } else if (pkg.dependencies.vue) {
                        projectInfo.framework = 'vue';
                        projectInfo.port = 8080;
                        projectInfo.command = 'npm run serve';
                    } else if (pkg.dependencies.next) {
                        projectInfo.framework = 'next';
                        projectInfo.port = 3000;
                        projectInfo.command = 'npm run dev';
                    } else if (pkg.dependencies.express) {
                        projectInfo.framework = 'express';
                        projectInfo.port = 3000;
                        projectInfo.command = 'npm start';
                    } else if (pkg.dependencies['http-server']) {
                        projectInfo.framework = 'static';
                        projectInfo.port = 3000;
                        projectInfo.command = 'npm start';
                    }
                }
                
                // Check for scripts
                if (pkg.scripts) {
                    if (pkg.scripts.start) {
                        projectInfo.command = 'npm start';
                    } else if (pkg.scripts.dev) {
                        projectInfo.command = 'npm run dev';
                    } else if (pkg.scripts.serve) {
                        projectInfo.command = 'npm run serve';
                    }
                }
                
            } else if (projectInfo.hasIndex && !projectInfo.hasPhp) {
                projectInfo.type = 'static';
                projectInfo.port = 3000;
                projectInfo.command = 'npx http-server -p 3000 --cors -c-1';
            } else if (projectInfo.hasPhp) {
                projectInfo.type = 'php';
                projectInfo.port = 80;
                projectInfo.command = null; // Will use PHP image
            } else if (projectInfo.hasPython) {
                projectInfo.type = 'python';
                projectInfo.port = 8000;
                projectInfo.command = 'python app.py';
            } else if (projectInfo.hasGo) {
                projectInfo.type = 'go';
                projectInfo.port = 8080;
                projectInfo.command = 'go run main.go';
            } else if (projectInfo.hasRuby) {
                projectInfo.type = 'ruby';
                projectInfo.port = 3000;
                projectInfo.command = 'bundle exec rails server';
            }
            
            // If we couldn't detect a project type, return null
            if (!projectInfo.type) {
                return null;
            }
            
            return projectInfo;
            
        } catch (error) {
            logger.error(`Error detecting project at ${projectPath}:`, error);
            return null;
        }
    }
    
    async readPackageJson(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error(`Error reading package.json at ${filePath}:`, error);
            return {};
        }
    }
}