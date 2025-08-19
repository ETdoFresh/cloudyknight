import yaml from 'js-yaml';
import { logger } from './logger.js';

export class S3ComposeGenerator {
    constructor(domain, network, s3Config) {
        this.domain = domain;
        this.network = network;
        this.s3Config = s3Config;
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
                    labels: this.generateLabels(projectName, projectInfo, routingRule),
                    environment: this.generateEnvironment(projectName, projectInfo)
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
                // Use our S3-enabled Node runtime
                service.image = 'workspace-node-s3:latest';
                service.build = {
                    context: './docker/node-s3-runtime',
                    dockerfile: 'Dockerfile'
                };
                
                // Override command if specified in project
                if (projectInfo.command) {
                    service.command = projectInfo.command.split(' ');
                }
                
                // Add health check
                service.healthcheck = {
                    test: ['CMD', 'test', '-f', '/app/.container-ready'],
                    interval: '30s',
                    timeout: '10s',
                    retries: 3,
                    start_period: '60s' // Give time for npm install
                };
                break;
                
            case 'python':
                // Python S3 runtime
                service.image = 'workspace-python-s3:latest';
                service.build = {
                    context: './docker/python-s3-runtime',
                    dockerfile: 'Dockerfile'
                };
                service.command = ['python', projectInfo.entrypoint || 'app.py'];
                break;
                
            case 'static':
                // Static files can be served directly from S3 or cached locally
                service.image = 'workspace-static-s3:latest';
                service.build = {
                    context: './docker/static-s3-runtime',
                    dockerfile: 'Dockerfile'
                };
                break;
                
            case 'php':
                service.image = 'workspace-php-s3:latest';
                service.build = {
                    context: './docker/php-s3-runtime',
                    dockerfile: 'Dockerfile'
                };
                break;
                
            default:
                // Generic S3 runtime
                service.image = 'workspace-generic-s3:latest';
                service.build = {
                    context: './docker/generic-s3-runtime',
                    dockerfile: 'Dockerfile'
                };
        }
        
        // No volume mounts needed - code comes from S3!
        // This means containers are truly ephemeral and stateless
        
        return yaml.dump(compose, { 
            indent: 2, 
            lineWidth: -1,
            noRefs: true 
        });
    }
    
    generateEnvironment(projectName, projectInfo) {
        return {
            // S3 configuration
            S3_ENDPOINT: this.s3Config.endpoint,
            S3_BUCKET: this.s3Config.bucketName,
            S3_ACCESS_KEY: this.s3Config.accessKeyId,
            S3_SECRET_KEY: this.s3Config.secretAccessKey,
            WORKSPACE_NAME: projectName,
            
            // Application configuration
            NODE_ENV: projectInfo.environment || 'production',
            PORT: projectInfo.port || 3000,
            
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