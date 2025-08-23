import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration for EHUB2023
const getDbConfig = () => ({
    host: process.env.DB_HOST || 'EHUB2023',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'cunoj2awh6a6trsi'
});

async function compareData() {
    const { Client } = pg;
    const client = new Client(getDbConfig());
    
    console.log('🔍 Comparing PostgreSQL data with workspaces.json\n');
    console.log('=' .repeat(60));
    
    try {
        // Connect to database
        await client.connect();
        console.log('✅ Connected to EHUB2023 PostgreSQL\n');
        
        // Load JSON file
        const jsonPath = path.join(__dirname, '../../admin/workspaces.json');
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        
        console.log(`📄 JSON File Stats:`);
        console.log(`   Total workspaces: ${jsonData.workspaces.length}`);
        console.log(`   Version: ${jsonData.version}`);
        console.log(`   Last Modified: ${jsonData.lastModified}\n`);
        
        // Get data from PostgreSQL
        const dbResult = await client.query('SELECT * FROM workspaces ORDER BY slug');
        const dbWorkspaces = dbResult.rows;
        
        console.log(`🗄️  Database Stats:`);
        console.log(`   Total workspaces: ${dbWorkspaces.length}\n`);
        
        // Check metadata
        try {
            const metaResult = await client.query(
                "SELECT key, value FROM workspace_metadata WHERE key IN ('version', 'lastModified')"
            );
            const metadata = {};
            metaResult.rows.forEach(row => {
                metadata[row.key] = row.value;
            });
            if (metadata.version) {
                console.log(`   Version in DB: ${metadata.version}`);
            }
            if (metadata.lastModified) {
                console.log(`   Last Modified in DB: ${metadata.lastModified}`);
            }
        } catch (err) {
            console.log('   ⚠️  No metadata table found');
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 Detailed Comparison:\n');
        
        // Create maps for easier comparison
        const jsonMap = new Map(jsonData.workspaces.map(w => [w.slug, w]));
        const dbMap = new Map(dbWorkspaces.map(w => [w.slug, w]));
        
        // Find workspaces in JSON but not in DB
        const missingInDb = [];
        for (const [slug, workspace] of jsonMap) {
            if (!dbMap.has(slug)) {
                missingInDb.push(workspace);
            }
        }
        
        if (missingInDb.length > 0) {
            console.log('❌ Workspaces in JSON but NOT in database:');
            missingInDb.forEach(w => {
                console.log(`   - ${w.name} (${w.slug}) - ${w.status}`);
            });
            console.log('');
        }
        
        // Find workspaces in DB but not in JSON
        const missingInJson = [];
        for (const [slug, workspace] of dbMap) {
            if (!jsonMap.has(slug)) {
                missingInJson.push(workspace);
            }
        }
        
        if (missingInJson.length > 0) {
            console.log('⚠️  Workspaces in database but NOT in JSON:');
            missingInJson.forEach(w => {
                console.log(`   - ${w.name} (${w.slug}) - ${w.status}`);
            });
            console.log('');
        }
        
        // Compare matching workspaces
        const differences = [];
        for (const [slug, jsonWorkspace] of jsonMap) {
            const dbWorkspace = dbMap.get(slug);
            if (dbWorkspace) {
                const diff = {};
                
                // Check each field
                const fieldsToCompare = ['name', 'icon', 'description', 'status', 'type'];
                for (const field of fieldsToCompare) {
                    if (jsonWorkspace[field] !== dbWorkspace[field]) {
                        diff[field] = {
                            json: jsonWorkspace[field],
                            db: dbWorkspace[field]
                        };
                    }
                }
                
                if (Object.keys(diff).length > 0) {
                    differences.push({ slug, diff });
                }
            }
        }
        
        if (differences.length > 0) {
            console.log('🔄 Field differences for matching workspaces:');
            differences.forEach(({ slug, diff }) => {
                console.log(`\n   ${slug}:`);
                for (const [field, values] of Object.entries(diff)) {
                    console.log(`     ${field}:`);
                    console.log(`       JSON: "${values.json}"`);
                    console.log(`       DB:   "${values.db}"`);
                }
            });
            console.log('');
        }
        
        // Summary
        console.log('=' .repeat(60));
        console.log('📈 Summary:\n');
        
        const inSync = missingInDb.length === 0 && 
                      missingInJson.length === 0 && 
                      differences.length === 0;
        
        if (inSync) {
            console.log('✅ Database and JSON file are in sync!');
            console.log(`   ${jsonData.workspaces.length} workspaces match perfectly.`);
        } else {
            console.log('⚠️  Database and JSON file have differences:');
            if (missingInDb.length > 0) {
                console.log(`   - ${missingInDb.length} workspaces missing in database`);
            }
            if (missingInJson.length > 0) {
                console.log(`   - ${missingInJson.length} workspaces missing in JSON`);
            }
            if (differences.length > 0) {
                console.log(`   - ${differences.length} workspaces have field differences`);
            }
            console.log('\n   Run "npm run migrate" to sync database with JSON file.');
        }
        
        // Show workspace status breakdown
        console.log('\n📊 Workspace Status Breakdown:');
        console.log('\n   JSON file:');
        const jsonStatusCount = {};
        jsonData.workspaces.forEach(w => {
            jsonStatusCount[w.status] = (jsonStatusCount[w.status] || 0) + 1;
        });
        for (const [status, count] of Object.entries(jsonStatusCount)) {
            console.log(`     ${status}: ${count}`);
        }
        
        if (dbWorkspaces.length > 0) {
            console.log('\n   Database:');
            const dbStatusCount = {};
            dbWorkspaces.forEach(w => {
                dbStatusCount[w.status] = (dbStatusCount[w.status] || 0) + 1;
            });
            for (const [status, count] of Object.entries(dbStatusCount)) {
                console.log(`     ${status}: ${count}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nMake sure:');
        console.error('1. EHUB2023 is accessible from your machine');
        console.error('2. PostgreSQL is running on port 5432');
        console.error('3. The database credentials are correct');
    } finally {
        await client.end();
        console.log('\n🔌 Database connection closed');
    }
}

// Run comparison
compareData().catch(console.error);