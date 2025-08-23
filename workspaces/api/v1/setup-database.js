import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direct connection to production database
const dbConfig = {
    host: 'localhost',  // Since this runs in the container, localhost is correct
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres'
};

async function setupDatabase() {
    const { Client } = pg;
    const client = new Client(dbConfig);
    
    try {
        console.log('🔌 Connecting to PostgreSQL...');
        await client.connect();
        console.log('✅ Connected to database');
        
        // Create tables
        console.log('📋 Creating database schema...');
        
        const schemaSQL = `
-- Workspaces table schema
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(10) DEFAULT '📁',
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    type VARCHAR(50) DEFAULT 'static' CHECK (type IN ('static', 'nodejs', 'python', 'php', 'custom', 'external')),
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_workspaces_modified 
    BEFORE UPDATE ON workspaces 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

-- Metadata table (optional, for versioning)
CREATE TABLE IF NOT EXISTS workspace_metadata (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert version info
INSERT INTO workspace_metadata (key, value) 
VALUES ('version', '1.0.0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
        `;
        
        await client.query(schemaSQL);
        console.log('✅ Schema created successfully');
        
        // Load and insert workspaces from JSON
        console.log('📂 Loading workspaces from JSON...');
        const jsonPath = path.join(__dirname, '../../admin/workspaces.json');
        
        try {
            const jsonContent = await fs.readFile(jsonPath, 'utf-8');
            const workspacesData = JSON.parse(jsonContent);
            
            if (workspacesData.workspaces && workspacesData.workspaces.length > 0) {
                console.log(`🔄 Importing ${workspacesData.workspaces.length} workspaces...`);
                
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
                        console.log(`  ✅ Imported: ${workspace.name} (${workspace.slug})`);
                    } catch (error) {
                        console.error(`  ❌ Failed to import ${workspace.name}:`, error.message);
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
            }
        } catch (error) {
            console.log('⚠️  Could not load workspaces.json:', error.message);
        }
        
        // Show final count
        const result = await client.query('SELECT COUNT(*) FROM workspaces');
        console.log(`\n🎉 Setup complete!`);
        console.log(`📊 Total workspaces in database: ${result.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run setup
setupDatabase().catch(console.error);