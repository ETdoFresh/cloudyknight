import yaml from 'js-yaml';
import { logger } from './logger.js';

export class EphemeralComposeGenerator {
    constructor(domain, network) {
        this.domain = domain;
        this.network = network;
    }
    
    async generate(projectName, projectInfo) {
        const isWww = projectName === 'www';
        const containerName = `workspace-${projectName}`;
        
        // Determine routing rules
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
                    labels: this.generateLabels(projectName, projectInfo, routingRule),
                    environment: this.generateEnvironment(projectName, projectInfo),
                    volumes: [
                        // Mount current directory as read-only
                        // Container will copy and install deps internally
                        `.:/workspace:ro`
                    ]
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
                // Use ephemeral Node runtime
                service.image = 'workspace-node-ephemeral:latest';
                service.build = {
                    context: './docker/node-ephemeral',
                    dockerfile: 'Dockerfile'
                };
                
                // Override command if specified
                if (projectInfo.command) {
                    service.command = projectInfo.command.split(' ');
                } else if (projectInfo.scripts?.start) {
                    service.command = ['npm', 'start'];
                } else {
                    service.command = ['node', projectInfo.entrypoint || 'index.js'];
                }
                
                // Health check
                service.healthcheck = {
                    test: ['CMD', 'test', '-f', '/app/.container-ready'],
                    interval: '30s',
                    timeout: '10s',
                    retries: 3,
                    start_period: '60s' // Give time for npm install
                };
                break;
                
            case 'python':
                service.image = 'workspace-python-ephemeral:latest';
                service.build = {
                    context: './docker/python-ephemeral',
                    dockerfile: 'Dockerfile'
                };
                service.command = ['python', projectInfo.entrypoint || 'app.py'];
                break;
                
            case 'static':
                // Static files served directly from mount
                service.image = 'nginx:alpine';
                service.volumes.push(
                    `/workspaces/${projectName}:/usr/share/nginx/html:ro`
                );
                break;
                
            case 'php':
                service.image = 'workspace-php-ephemeral:latest';
                service.build = {
                    context: './docker/php-ephemeral',
                    dockerfile: 'Dockerfile'
                };
                break;
                
            case 'go':
                service.image = 'workspace-go-ephemeral:latest';
                service.build = {
                    context: './docker/go-ephemeral',
                    dockerfile: 'Dockerfile'
                };
                service.command = ['go', 'run', projectInfo.entrypoint || 'main.go'];
                break;
                
            case 'ruby':
                service.image = 'workspace-ruby-ephemeral:latest';
                service.build = {
                    context: './docker/ruby-ephemeral',
                    dockerfile: 'Dockerfile'
                };
                break;
                
            default:
                // Generic ephemeral runtime
                service.image = 'workspace-generic-ephemeral:latest';
                service.build = {
                    context: './docker/generic-ephemeral',
                    dockerfile: 'Dockerfile'
                };
        }
        
        return yaml.dump(compose, { 
            indent: 2, 
            lineWidth: -1,
            noRefs: true 
        });
    }
    
    generateEnvironment(projectName, projectInfo) {
        return {
            NODE_ENV: projectInfo.environment || 'production',
            PORT: projectInfo.port || 3000,
            WORKSPACE_NAME: projectName,
            
            // Add any custom environment variables from project
            ...(projectInfo.env || {})
        };
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
        
        return labels;
    }
}