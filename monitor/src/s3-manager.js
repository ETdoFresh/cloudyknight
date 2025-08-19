import AWS from 'aws-sdk';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { glob } from 'glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { logger } from './logger.js';

export class S3WorkspaceManager {
    constructor(config) {
        this.bucketName = config.bucketName || 'workspaces';
        this.endpoint = config.endpoint || 'http://localhost:9000'; // MinIO default
        
        // Configure S3 client (works with both AWS S3 and MinIO)
        this.s3 = new AWS.S3({
            endpoint: this.endpoint,
            accessKeyId: config.accessKeyId || process.env.S3_ACCESS_KEY,
            secretAccessKey: config.secretAccessKey || process.env.S3_SECRET_KEY,
            s3ForcePathStyle: true, // Required for MinIO
            signatureVersion: 'v4'
        });
        
        this.initBucket();
    }
    
    async initBucket() {
        try {
            await this.s3.headBucket({ Bucket: this.bucketName }).promise();
            logger.info(`Connected to S3 bucket: ${this.bucketName}`);
        } catch (error) {
            if (error.statusCode === 404) {
                logger.info(`Creating bucket: ${this.bucketName}`);
                await this.s3.createBucket({ Bucket: this.bucketName }).promise();
            } else {
                logger.error('S3 connection error:', error);
            }
        }
    }
    
    /**
     * Upload a workspace to S3, respecting .gitignore rules
     */
    async uploadWorkspace(workspaceName, localPath) {
        const ig = this.loadIgnoreRules(localPath);
        const files = await this.getFilteredFiles(localPath, ig);
        
        logger.info(`Uploading ${files.length} files for workspace: ${workspaceName}`);
        
        for (const file of files) {
            const relativePath = path.relative(localPath, file);
            const s3Key = `${workspaceName}/${relativePath}`;
            
            await this.uploadFile(file, s3Key);
        }
        
        // Upload metadata
        await this.updateWorkspaceMetadata(workspaceName, {
            lastUpdated: new Date().toISOString(),
            fileCount: files.length
        });
        
        logger.info(`Workspace ${workspaceName} uploaded successfully`);
    }
    
    /**
     * Load .gitignore rules for filtering
     */
    loadIgnoreRules(basePath) {
        const ig = ignore();
        
        // Default ignores (always exclude these)
        ig.add([
            'node_modules/',
            '.git/',
            '*.log',
            '.env',
            '.env.local',
            '.DS_Store',
            'Thumbs.db',
            'dist/',
            'build/',
            '.vscode/',
            '.idea/',
            '*.swp',
            '*.swo',
            '*~',
            'npm-debug.log*',
            'yarn-debug.log*',
            'yarn-error.log*'
        ]);
        
        // Load project .gitignore if exists
        const gitignorePath = path.join(basePath, '.gitignore');
        if (existsSync(gitignorePath)) {
            const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
            ig.add(gitignoreContent);
        }
        
        // Load .dockerignore if exists (for container-specific ignores)
        const dockerignorePath = path.join(basePath, '.dockerignore');
        if (existsSync(dockerignorePath)) {
            const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');
            ig.add(dockerignoreContent);
        }
        
        return ig;
    }
    
    /**
     * Get list of files to upload (filtered by ignore rules)
     */
    async getFilteredFiles(basePath, ignoreRules) {
        const allFiles = await glob('**/*', {
            cwd: basePath,
            absolute: true,
            nodir: true,
            dot: true
        });
        
        return allFiles.filter(file => {
            const relativePath = path.relative(basePath, file);
            return !ignoreRules.ignores(relativePath);
        });
    }
    
    /**
     * Upload a single file to S3
     */
    async uploadFile(localPath, s3Key) {
        const fileStream = createReadStream(localPath);
        const contentType = this.getContentType(localPath);
        
        await this.s3.upload({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: fileStream,
            ContentType: contentType
        }).promise();
    }
    
    /**
     * List all workspaces in S3
     */
    async listWorkspaces() {
        const result = await this.s3.listObjectsV2({
            Bucket: this.bucketName,
            Delimiter: '/',
            Prefix: ''
        }).promise();
        
        const workspaces = result.CommonPrefixes.map(prefix => 
            prefix.Prefix.replace('/', '')
        );
        
        return workspaces;
    }
    
    /**
     * Get workspace metadata
     */
    async getWorkspaceMetadata(workspaceName) {
        try {
            const result = await this.s3.getObject({
                Bucket: this.bucketName,
                Key: `${workspaceName}/.workspace-meta.json`
            }).promise();
            
            return JSON.parse(result.Body.toString());
        } catch (error) {
            if (error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }
    
    /**
     * Update workspace metadata
     */
    async updateWorkspaceMetadata(workspaceName, metadata) {
        await this.s3.putObject({
            Bucket: this.bucketName,
            Key: `${workspaceName}/.workspace-meta.json`,
            Body: JSON.stringify(metadata, null, 2),
            ContentType: 'application/json'
        }).promise();
    }
    
    /**
     * Download workspace to a local directory (for container initialization)
     */
    async downloadWorkspace(workspaceName, targetPath) {
        const objects = await this.s3.listObjectsV2({
            Bucket: this.bucketName,
            Prefix: `${workspaceName}/`
        }).promise();
        
        for (const object of objects.Contents) {
            const relativePath = object.Key.replace(`${workspaceName}/`, '');
            const localPath = path.join(targetPath, relativePath);
            
            await this.downloadFile(object.Key, localPath);
        }
        
        logger.info(`Downloaded workspace ${workspaceName} to ${targetPath}`);
    }
    
    /**
     * Download a single file from S3
     */
    async downloadFile(s3Key, localPath) {
        const dir = path.dirname(localPath);
        await fs.promises.mkdir(dir, { recursive: true });
        
        const fileStream = createWriteStream(localPath);
        const s3Stream = this.s3.getObject({
            Bucket: this.bucketName,
            Key: s3Key
        }).createReadStream();
        
        await pipeline(s3Stream, fileStream);
    }
    
    /**
     * Delete a workspace from S3
     */
    async deleteWorkspace(workspaceName) {
        const objects = await this.s3.listObjectsV2({
            Bucket: this.bucketName,
            Prefix: `${workspaceName}/`
        }).promise();
        
        if (objects.Contents.length > 0) {
            await this.s3.deleteObjects({
                Bucket: this.bucketName,
                Delete: {
                    Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
                }
            }).promise();
        }
        
        logger.info(`Deleted workspace: ${workspaceName}`);
    }
    
    /**
     * Watch for changes in S3 (polling-based)
     */
    async watchWorkspaces(callback, interval = 30000) {
        setInterval(async () => {
            try {
                const workspaces = await this.listWorkspaces();
                const workspaceDetails = [];
                
                for (const workspace of workspaces) {
                    const metadata = await this.getWorkspaceMetadata(workspace);
                    workspaceDetails.push({
                        name: workspace,
                        ...metadata
                    });
                }
                
                callback(workspaceDetails);
            } catch (error) {
                logger.error('Error polling S3:', error);
            }
        }, interval);
    }
    
    /**
     * Get content type for file upload
     */
    getContentType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.txt': 'text/plain',
            '.md': 'text/markdown'
        };
        
        return contentTypes[ext] || 'application/octet-stream';
    }
    
    /**
     * Generate pre-signed URL for direct container download
     */
    async getPresignedUrl(s3Key, expiresIn = 3600) {
        return this.s3.getSignedUrlPromise('getObject', {
            Bucket: this.bucketName,
            Key: s3Key,
            Expires: expiresIn
        });
    }
}