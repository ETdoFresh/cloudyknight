import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const getDbConfig = () => {
    if (process.env.NODE_ENV === 'production') {
        // Production - using Dokploy container
        return {
            host: 'workspaces-postgresql-j6qubz',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: 'cunoj2awh6a6trsi'
        };
    } else {
        // Local development - using EHUB2023
        return {
            host: process.env.DB_HOST || 'EHUB2023',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'cunoj2awh6a6trsi'
        };
    }
};

async function migrate() {
    const { Client } = pg;
    const client = new Client(getDbConfig());
    
    try {
        console.log('🔌 Connecting to PostgreSQL...');
        await client.connect();
        console.log('✅ Connected to database');
        
        // Run schema creation
        console.log('📋 Creating database schema...');
        const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf-8');
        await client.query(schema);
        console.log('✅ Schema created/updated');
        
        // Load existing workspaces from JSON
        console.log('📂 Loading workspaces from JSON...');
        const jsonPath = '/workspaces/admin/workspaces.json';
        let workspacesData;
        
        try {
            const jsonContent = await fs.readFile(jsonPath, 'utf-8');
            workspacesData = JSON.parse(jsonContent);
        } catch (error) {
            console.log('⚠️  No existing workspaces.json found or error reading it:', error.message);
            console.log('📝 Starting with empty database');
            return;
        }
        
        if (!workspacesData.workspaces || workspacesData.workspaces.length === 0) {
            console.log('📝 No workspaces to migrate');
            return;
        }
        
        // Migrate each workspace
        console.log(`🔄 Migrating ${workspacesData.workspaces.length} workspaces...`);
        
        for (const workspace of workspacesData.workspaces) {
            try {
                const query = `
                    INSERT INTO workspaces (id, slug, name, icon, description, status, type, created)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        slug = EXCLUDED.slug,
                        name = EXCLUDED.name,
                        icon = EXCLUDED.icon,
                        description = EXCLUDED.description,
                        status = EXCLUDED.status,
                        type = EXCLUDED.type,
                        modified = CURRENT_TIMESTAMP
                `;
                
                const values = [
                    workspace.id,
                    workspace.slug,
                    workspace.name,
                    workspace.icon || '📁',
                    workspace.description || '',
                    workspace.status || 'active',
                    workspace.type || 'static',
                    workspace.created || new Date().toISOString()
                ];
                
                await client.query(query, values);
                console.log(`  ✅ Migrated: ${workspace.name} (${workspace.slug})`);
            } catch (error) {
                console.error(`  ❌ Failed to migrate ${workspace.name}:`, error.message);
            }
        }
        
        // Update metadata
        if (workspacesData.version) {
            await client.query(
                `INSERT INTO workspace_metadata (key, value) 
                 VALUES ('version', $1)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [workspacesData.version]
            );
        }
        
        if (workspacesData.lastModified) {
            await client.query(
                `INSERT INTO workspace_metadata (key, value) 
                 VALUES ('lastModified', $1)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [workspacesData.lastModified]
            );
        }
        
        console.log('🎉 Migration completed successfully!');
        
        // Show migrated count
        const result = await client.query('SELECT COUNT(*) FROM workspaces');
        console.log(`📊 Total workspaces in database: ${result.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migration
migrate().catch(console.error);