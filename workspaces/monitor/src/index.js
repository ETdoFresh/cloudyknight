import { WorkspaceMonitor } from './monitor.js';
import { WebServer } from './web-server.js';
import { logger } from './logger.js';

async function main() {
    logger.info('Starting Workspace Monitor Service');
    
    const monitor = new WorkspaceMonitor({
        workspacePath: process.env.WORKSPACE_PATH || '/workspaces',
        domain: process.env.DOMAIN || 'etdofresh-dev.duckdns.org',
        network: process.env.NETWORK || 'traefik-network',
        scanInterval: parseInt(process.env.SCAN_INTERVAL) || 30000
    });
    
    const webServer = new WebServer(monitor, process.env.WEB_PORT || 4000);
    
    try {
        await monitor.start();
        await webServer.start();
        logger.info('Workspace Monitor and Dashboard are running');
        
        // Set up monitor event broadcasting
        monitor.on('project:updated', (project) => {
            webServer.broadcastUpdate('project:updated', project);
        });
        
        monitor.on('project:added', (project) => {
            webServer.broadcastUpdate('project:added', project);
        });
        
        monitor.on('log', (logEntry) => {
            webServer.broadcastUpdate('log', logEntry);
        });
        
        // Keep the process running
        process.on('SIGINT', async () => {
            logger.info('Shutting down monitor...');
            await monitor.stop();
            await webServer.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            logger.info('Shutting down monitor...');
            await monitor.stop();
            await webServer.stop();
            process.exit(0);
        });
        
    } catch (error) {
        logger.error('Failed to start monitor:', error);
        process.exit(1);
    }
}

main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
});