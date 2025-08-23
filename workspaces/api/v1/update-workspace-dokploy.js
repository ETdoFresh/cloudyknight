// Script to replace Traefik workspace with Dokploy workspace
const API_URL = 'https://workspaces.etdofresh.com/api/v1';

async function replaceTraefikWithDokploy() {
    console.log('🔄 Replacing Traefik workspace with Dokploy...\n');
    
    try {
        // First, delete the Traefik workspace
        console.log('1️⃣ Removing Traefik workspace...');
        const deleteResponse = await fetch(`${API_URL}/workspaces/traefik`, {
            method: 'DELETE'
        });
        
        if (deleteResponse.ok) {
            console.log('✅ Traefik workspace removed successfully');
        } else {
            const error = await deleteResponse.text();
            console.log(`⚠️  Could not remove Traefik: ${error}`);
        }
        
        // Now create the Dokploy workspace
        console.log('\n2️⃣ Creating Dokploy workspace...');
        const dokployWorkspace = {
            slug: 'dokploy',
            name: 'Dokploy',
            icon: '🚀',
            description: 'Application deployment platform with Docker integration',
            status: 'active',
            type: 'external'
        };
        
        const createResponse = await fetch(`${API_URL}/workspaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dokployWorkspace)
        });
        
        if (createResponse.ok) {
            const created = await createResponse.json();
            console.log('✅ Dokploy workspace created successfully');
            console.log(`   Name: ${created.name}`);
            console.log(`   Icon: ${created.icon}`);
            console.log(`   Slug: ${created.slug}`);
            console.log(`   Description: ${created.description}`);
            console.log(`   Status: ${created.status}`);
            console.log(`   Type: ${created.type}`);
        } else {
            const error = await createResponse.text();
            console.log(`❌ Failed to create Dokploy workspace: ${error}`);
        }
        
        // Verify the change
        console.log('\n3️⃣ Verifying changes...');
        const verifyResponse = await fetch(`${API_URL}/workspaces`);
        if (verifyResponse.ok) {
            const data = await verifyResponse.json();
            const hasDokploy = data.workspaces.some(w => w.slug === 'dokploy');
            const hasTraefik = data.workspaces.some(w => w.slug === 'traefik');
            
            console.log(`   Dokploy exists: ${hasDokploy ? '✅' : '❌'}`);
            console.log(`   Traefik removed: ${!hasTraefik ? '✅' : '❌'}`);
            console.log(`   Total workspaces: ${data.workspaces.length}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the replacement
replaceTraefikWithDokploy();