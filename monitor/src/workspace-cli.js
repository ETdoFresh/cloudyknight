#!/usr/bin/env node

import { Command } from 'commander';
import { S3WorkspaceManager } from './s3-manager.js';
import { ProjectDetector } from './project-detector.js';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();

// Initialize S3 manager
const s3Manager = new S3WorkspaceManager({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    bucketName: process.env.S3_BUCKET || 'workspaces',
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
});

const detector = new ProjectDetector();

program
    .name('workspace')
    .description('CLI tool for managing S3-based workspaces')
    .version('1.0.0');

// Upload command
program
    .command('upload <workspace-name> [path]')
    .description('Upload a workspace to S3')
    .option('--watch', 'Watch for changes and auto-upload')
    .action(async (workspaceName, workspacePath = '.', options) => {
        const absolutePath = path.resolve(workspacePath);
        
        if (!existsSync(absolutePath)) {
            console.error(chalk.red(`Path does not exist: ${absolutePath}`));
            process.exit(1);
        }
        
        const spinner = ora(`Uploading workspace: ${workspaceName}`).start();
        
        try {
            // Detect project type
            const projectInfo = await detector.detectProject(absolutePath);
            console.log(chalk.blue(`\nDetected project type: ${projectInfo.type}`));
            
            // Upload to S3
            await s3Manager.uploadWorkspace(workspaceName, absolutePath);
            
            // Update metadata with project info
            await s3Manager.updateWorkspaceMetadata(workspaceName, {
                ...projectInfo,
                uploadedAt: new Date().toISOString(),
                sourcePath: absolutePath
            });
            
            spinner.succeed(chalk.green(`Workspace ${workspaceName} uploaded successfully!`));
            
            if (options.watch) {
                console.log(chalk.yellow('\n👁️  Watching for changes...'));
                // Implement file watcher here
                watchWorkspace(workspaceName, absolutePath);
            }
        } catch (error) {
            spinner.fail(chalk.red(`Failed to upload workspace: ${error.message}`));
            process.exit(1);
        }
    });

// List command
program
    .command('list')
    .description('List all workspaces in S3')
    .action(async () => {
        const spinner = ora('Fetching workspaces...').start();
        
        try {
            const workspaces = await s3Manager.listWorkspaces();
            spinner.stop();
            
            if (workspaces.length === 0) {
                console.log(chalk.yellow('No workspaces found'));
                return;
            }
            
            console.log(chalk.blue('\nAvailable workspaces:'));
            for (const workspace of workspaces) {
                const metadata = await s3Manager.getWorkspaceMetadata(workspace);
                if (metadata) {
                    console.log(`  📦 ${chalk.green(workspace)} - ${metadata.type || 'unknown'} (${metadata.fileCount || 0} files)`);
                    if (metadata.uploadedAt) {
                        console.log(`     Last uploaded: ${new Date(metadata.uploadedAt).toLocaleString()}`);
                    }
                } else {
                    console.log(`  📦 ${chalk.green(workspace)}`);
                }
            }
        } catch (error) {
            spinner.fail(chalk.red(`Failed to list workspaces: ${error.message}`));
            process.exit(1);
        }
    });

// Download command
program
    .command('download <workspace-name> [target-path]')
    .description('Download a workspace from S3')
    .action(async (workspaceName, targetPath = `./${workspaceName}`) => {
        const spinner = ora(`Downloading workspace: ${workspaceName}`).start();
        
        try {
            await s3Manager.downloadWorkspace(workspaceName, targetPath);
            spinner.succeed(chalk.green(`Workspace ${workspaceName} downloaded to ${targetPath}`));
        } catch (error) {
            spinner.fail(chalk.red(`Failed to download workspace: ${error.message}`));
            process.exit(1);
        }
    });

// Delete command
program
    .command('delete <workspace-name>')
    .description('Delete a workspace from S3')
    .option('--force', 'Skip confirmation')
    .action(async (workspaceName, options) => {
        if (!options.force) {
            console.log(chalk.yellow(`⚠️  This will permanently delete workspace: ${workspaceName}`));
            console.log('Press Ctrl+C to cancel, or any other key to continue...');
            
            // Simple confirmation
            await new Promise(resolve => {
                process.stdin.once('data', resolve);
                process.stdin.resume();
            });
        }
        
        const spinner = ora(`Deleting workspace: ${workspaceName}`).start();
        
        try {
            await s3Manager.deleteWorkspace(workspaceName);
            spinner.succeed(chalk.green(`Workspace ${workspaceName} deleted successfully`));
        } catch (error) {
            spinner.fail(chalk.red(`Failed to delete workspace: ${error.message}`));
            process.exit(1);
        }
    });

// Sync command (for CI/CD pipelines)
program
    .command('sync <workspace-name> [path]')
    .description('Sync a workspace with S3 (upload only changed files)')
    .action(async (workspaceName, workspacePath = '.') => {
        const spinner = ora(`Syncing workspace: ${workspaceName}`).start();
        
        try {
            // For now, this just uploads everything
            // In production, you'd implement proper sync logic
            await s3Manager.uploadWorkspace(workspaceName, path.resolve(workspacePath));
            spinner.succeed(chalk.green(`Workspace ${workspaceName} synced successfully`));
        } catch (error) {
            spinner.fail(chalk.red(`Failed to sync workspace: ${error.message}`));
            process.exit(1);
        }
    });

// Watch function for auto-upload
async function watchWorkspace(workspaceName, workspacePath) {
    const { watch } = await import('chokidar');
    const ig = s3Manager.loadIgnoreRules(workspacePath);
    
    const watcher = watch(workspacePath, {
        ignored: (filePath) => {
            const relativePath = path.relative(workspacePath, filePath);
            return ig.ignores(relativePath);
        },
        persistent: true,
        ignoreInitial: true
    });
    
    let uploadTimeout;
    const scheduleUpload = () => {
        clearTimeout(uploadTimeout);
        uploadTimeout = setTimeout(async () => {
            console.log(chalk.blue('\n📤 Uploading changes...'));
            try {
                await s3Manager.uploadWorkspace(workspaceName, workspacePath);
                console.log(chalk.green('✅ Changes uploaded'));
            } catch (error) {
                console.error(chalk.red(`❌ Upload failed: ${error.message}`));
            }
        }, 2000); // Wait 2 seconds after last change
    };
    
    watcher
        .on('add', path => {
            console.log(chalk.gray(`File added: ${path}`));
            scheduleUpload();
        })
        .on('change', path => {
            console.log(chalk.gray(`File changed: ${path}`));
            scheduleUpload();
        })
        .on('unlink', path => {
            console.log(chalk.gray(`File removed: ${path}`));
            scheduleUpload();
        });
}

program.parse(process.argv);