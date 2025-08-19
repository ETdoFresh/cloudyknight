import yaml from 'js-yaml';
import { logger } from './logger.js';

export class ComposeGenerator {
    constructor(domain, network) {
        this.domain = domain;
        this.network = network;
    }
    
    async generate(projectName, projectInfo) {
        const isWww = projectName === 'www';
        const containerName = `workspace-${projectName}`;
        
        // Determine routing rules based on project name
        const routingRule = isWww 
            ? `Host(\`${this.domain}\`) && (Path(\`/\`) || PathRegexp(\`^/[^/]+\\\\.[^/]+$$\`))`
            : `Host(\`${this.domain}\`) && PathPrefix(\`/${projectName}\`)`;
        
        const compose = {
            version: '3.8',
            services: {
                [projectName]: {
                    container_name: containerName,
                    networks: [this.network],
                    restart: 'unless-stopped',
                    labels: this.generateLabels(projectName, projectInfo, routingRule)
                }
            },
            networks: {
                [this.network]: {
                    external: true
                }
            }
        };
        
        // Configure service based on project type
        const service = compose.services[projectName];
        
        switch (projectInfo.type) {
            case 'node':
                service.image = 'node:20-alpine';
                service.working_dir = '/app';
                // For www, only mount the public directory
                if (projectName === 'www') {
                    // Use absolute paths that work on the host system
                    const absolutePath = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                    service.volumes = [
                        `${absolutePath}/public:/app/public:ro`,
                        `${absolutePath}/package.json:/app/package.json:ro`
                    ];
                    service.command = 'sh -c "npm install -g http-server && http-server public -p 3000 --cors -c-1"';
                } else {
                    // Use absolute path for other projects too
                    const absolutePath = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                    service.volumes = [
                        `${absolutePath}:/app:ro`,
                        '/app/node_modules'
                    ];
                    service.command = `sh -c "npm install && ${projectInfo.command || 'npm start'}"`;
                }
                service.environment = {
                    NODE_ENV: 'production',
                    PORT: projectInfo.port
                };
                break;
                
            case 'static':
                service.image = 'node:20-alpine';
                service.working_dir = '/app';
                const absolutePathStatic = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                service.volumes = [`${absolutePathStatic}:/app:ro`];
                service.command = 'sh -c "npm install -g http-server && http-server -p 3000 --cors -c-1"';
                break;
                
            case 'php':
                service.image = 'php:8.2-apache';
                const absolutePathPhp = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                service.volumes = [`${absolutePathPhp}:/var/www/html:ro`];
                break;
                
            case 'python':
                service.image = 'python:3.11-slim';
                service.working_dir = '/app';
                const absolutePathPython = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                service.volumes = [`${absolutePathPython}:/app:ro`];
                service.command = 'sh -c "pip install -r requirements.txt && python app.py"';
                break;
                
            case 'go':
                service.image = 'golang:1.21-alpine';
                service.working_dir = '/app';
                const absolutePathGo = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                service.volumes = [`${absolutePathGo}:/app:ro`];
                service.command = projectInfo.command || 'go run main.go';
                break;
                
            case 'ruby':
                service.image = 'ruby:3.2-slim';
                service.working_dir = '/app';
                const absolutePathRuby = projectInfo.path.replace('/workspaces', '/home/claude/cloudyknight/workspaces');
                service.volumes = [`${absolutePathRuby}:/app:ro`];
                service.command = 'sh -c "bundle install && bundle exec rails server -b 0.0.0.0"';
                break;
        }
        
        // If project has its own Dockerfile, use it
        if (projectInfo.hasDockerfile) {
            delete service.image;
            service.build = '.';
        }
        
        return yaml.dump(compose, { 
            indent: 2, 
            lineWidth: -1,
            noRefs: true 
        });
    }
    
    generateLabels(projectName, projectInfo, routingRule) {
        const isWww = projectName === 'www';
        const routerName = `workspace-${projectName}`;
        const port = projectInfo.port || 3000;
        
        const labels = [
            'traefik.enable=true',
            `traefik.docker.network=${this.network}`
        ];
        
        // HTTP router (will redirect to HTTPS)
        labels.push(`traefik.http.routers.${routerName}.rule=${routingRule}`);
        labels.push(`traefik.http.routers.${routerName}.entrypoints=web`);
        
        // HTTPS router
        labels.push(`traefik.http.routers.${routerName}-secure.rule=${routingRule}`);
        labels.push(`traefik.http.routers.${routerName}-secure.entrypoints=websecure`);
        labels.push(`traefik.http.routers.${routerName}-secure.tls=true`);
        labels.push(`traefik.http.routers.${routerName}-secure.tls.certresolver=letsencrypt`);
        
        // Path stripping middleware for non-www projects
        if (!isWww) {
            labels.push(`traefik.http.middlewares.${routerName}-strip.stripprefix.prefixes=/${projectName}`);
            labels.push(`traefik.http.routers.${routerName}-secure.middlewares=${routerName}-strip`);
        }
        
        // Service configuration
        labels.push(`traefik.http.services.${routerName}.loadbalancer.server.port=${port}`);
        
        // Return labels without extra quotes - YAML will handle them
        return labels;
    }
    
    async update(projectName, projectInfo, currentContent) {
        try {
            const current = yaml.load(currentContent);
            const isWww = projectName === 'www';
            
            // Check if Traefik labels need updating
            const service = current.services?.[projectName] || current.services?.['static-server'] || current.services?.[Object.keys(current.services)[0]];
            
            if (service && service.labels) {
                // Find routing rule label
                const routingRule = isWww 
                    ? `Host(\`${this.domain}\`) && (Path(\`/\`) || PathRegexp(\`^/[^/]+\\\\.[^/]+$$\`))`
                    : `Host(\`${this.domain}\`) && PathPrefix(\`/${projectName}\`)`;
                
                const hasCorrectRouting = service.labels.some(label => 
                    label.includes(routingRule)
                );
                
                if (!hasCorrectRouting) {
                    logger.info(`Updating routing rules for ${projectName}`);
                    
                    // Update labels
                    service.labels = this.generateLabels(projectName, projectInfo, routingRule);
                    
                    return yaml.dump(current, { 
                        indent: 2, 
                        lineWidth: -1,
                        noRefs: true 
                    });
                }
            }
            
            return currentContent;
            
        } catch (error) {
            logger.error(`Error updating compose file for ${projectName}:`, error);
            return currentContent;
        }
    }
}