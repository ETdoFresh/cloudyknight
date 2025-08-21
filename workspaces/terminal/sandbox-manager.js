import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

// Track active sandbox containers
const activeSandboxes = new Map();

// Create or get sandbox container for a workspace
app.post('/api/sandbox/:workspace', async (req, res) => {
    const { workspace } = req.params;
    
    try {
        const containerName = `sandbox-${workspace}`;
        
        // Check if container already exists
        const { stdout: psOutput } = await execAsync(`docker ps -a --filter name=${containerName} --format "{{.Names}}"`);
        
        if (psOutput.trim() === containerName) {
            // Container exists, check if running
            const { stdout: statusOutput } = await execAsync(`docker ps --filter name=${containerName} --format "{{.Names}}"`);
            
            if (statusOutput.trim() !== containerName) {
                // Start stopped container
                await execAsync(`docker start ${containerName}`);
            }
            
            // Wait for ttyd to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            res.json({
                success: true,
                containerName,
                wsUrl: `/terminal/sandbox/${workspace}/ws`
            });
        } else {
            // Create new container
            const workspacePath = `/home/claude/cloudyknight/workspaces/${workspace}`;
            
            const createCmd = `docker run -d \
                --name ${containerName} \
                --hostname ${workspace}-sandbox \
                -v ${workspacePath}:/workspace:rw \
                -v /home/claude/cloudyknight/workspaces:/workspaces:rw \
                -e WORKSPACE_NAME=${workspace} \
                -e TERM=xterm-256color \
                --network traefik-network \
                --label "traefik.enable=true" \
                --label "traefik.docker.network=traefik-network" \
                --label "traefik.http.routers.${containerName}.rule=Host(\\\`\${DOMAIN:-workspaces.etdofresh.com}\\\`) && PathPrefix(\\\`/terminal/sandbox/${workspace}\\\`)" \
                --label "traefik.http.routers.${containerName}.entrypoints=websecure" \
                --label "traefik.http.routers.${containerName}.tls=true" \
                --label "traefik.http.routers.${containerName}.tls.certresolver=letsencrypt" \
                --label "traefik.http.routers.${containerName}.priority=20" \
                --label "traefik.http.services.${containerName}.loadbalancer.server.port=7681" \
                --label "traefik.http.middlewares.${containerName}-strip.stripprefix.prefixes=/terminal/sandbox/${workspace}" \
                --label "traefik.http.routers.${containerName}.middlewares=${containerName}-strip" \
                terminal-sandbox:latest`;
            
            await execAsync(createCmd);
            
            // Wait for container to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            activeSandboxes.set(workspace, containerName);
            
            res.json({
                success: true,
                containerName,
                wsUrl: `/terminal/sandbox/${workspace}/ws`,
                created: true
            });
        }
    } catch (error) {
        console.error('Error creating sandbox:', error);
        res.status(500).json({ error: error.message });
    }
});

// Stop sandbox container
app.delete('/api/sandbox/:workspace', async (req, res) => {
    const { workspace } = req.params;
    const containerName = `sandbox-${workspace}`;
    
    try {
        await execAsync(`docker stop ${containerName}`);
        res.json({ success: true, stopped: containerName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clean up inactive sandboxes
app.post('/api/sandbox/cleanup', async (req, res) => {
    try {
        // Stop and remove containers inactive for more than 1 hour
        const { stdout } = await execAsync(`docker ps -a --filter "name=sandbox-" --format "{{.Names}} {{.Status}}"`);
        const containers = stdout.trim().split('\n').filter(line => line);
        
        const cleaned = [];
        for (const line of containers) {
            const [name, ...statusParts] = line.split(' ');
            const status = statusParts.join(' ');
            
            // Check if container has been stopped for a while
            if (status.includes('Exited') && (status.includes('hours ago') || status.includes('days ago'))) {
                await execAsync(`docker rm ${name}`);
                cleaned.push(name);
            }
        }
        
        res.json({ success: true, cleaned });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Sandbox manager listening on port ${PORT}`);
});