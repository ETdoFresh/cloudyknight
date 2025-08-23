import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://workspaces.etdofresh.com/api/v1';

async function populateDatabase() {
    console.log('🚀 Starting database population from workspaces.json\n');
    console.log('=' .repeat(60));
    
    try {
        // Load workspaces.json
        const jsonPath = path.join(__dirname, '../../admin/workspaces.json');
        console.log(`📄 Reading workspaces.json from: ${jsonPath}`);
        
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        
        console.log(`✅ Found ${jsonData.workspaces.length} workspaces to import\n`);
        
        // First, check API health
        console.log('🔍 Checking API health...');
        try {
            const healthResponse = await fetch(`${API_URL}/health`);
            const health = await healthResponse.json();
            console.log(`✅ API is ${health.status}`);
            if (health.database) {
                console.log(`   Database connected: ${health.database.connected}`);
                console.log(`   Current workspaces in DB: ${health.database.workspaces || 0}`);
            }
        } catch (err) {
            console.log('⚠️  Could not check health endpoint');
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('📥 Importing workspaces:\n');
        
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        
        for (const workspace of jsonData.workspaces) {
            try {
                // First check if workspace already exists
                const checkResponse = await fetch(`${API_URL}/workspaces/${workspace.slug}`);
                
                if (checkResponse.ok) {
                    console.log(`⏭️  Skipping ${workspace.name} (${workspace.slug}) - already exists`);
                    skippedCount++;
                    continue;
                }
                
                // Create the workspace
                const response = await fetch(`${API_URL}/workspaces`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        slug: workspace.slug,
                        name: workspace.name,
                        icon: workspace.icon || '📁',
                        description: workspace.description || '',
                        status: workspace.status || 'active',
                        type: workspace.type || 'static'
                    })
                });
                
                if (response.ok) {
                    const created = await response.json();
                    console.log(`✅ Added: ${created.name} (${created.slug}) - ${created.status}`);
                    successCount++;
                } else {
                    const error = await response.text();
                    console.log(`❌ Failed: ${workspace.name} (${workspace.slug}) - ${error}`);
                    errorCount++;
                }
            } catch (error) {
                console.log(`❌ Error adding ${workspace.name}: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 Import Summary:\n');
        console.log(`   ✅ Successfully added: ${successCount}`);
        console.log(`   ⏭️  Already existed: ${skippedCount}`);
        console.log(`   ❌ Failed: ${errorCount}`);
        console.log(`   📋 Total processed: ${jsonData.workspaces.length}`);
        
        // Verify final state
        console.log('\n🔍 Verifying final database state...');
        try {
            const finalResponse = await fetch(`${API_URL}/workspaces`);
            const finalData = await finalResponse.json();
            console.log(`\n✅ Database now contains ${finalData.workspaces.length} workspaces`);
            
            // Show status breakdown
            const statusCount = {};
            finalData.workspaces.forEach(w => {
                statusCount[w.status] = (statusCount[w.status] || 0) + 1;
            });
            
            console.log('\n📊 Status breakdown:');
            for (const [status, count] of Object.entries(statusCount)) {
                console.log(`   ${status}: ${count}`);
            }
        } catch (err) {
            console.log('⚠️  Could not verify final state');
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run population
console.log(`🌐 Target API: ${API_URL}\n`);
populateDatabase().catch(console.error);