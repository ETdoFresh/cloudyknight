import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const getDbConfig = () => {
    if (process.env.NODE_ENV === 'production') {
        return {
            host: 'workspaces-postgresql-j6qubz',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: 'cunoj2awh6a6trsi'
        };
    } else {
        return {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres'
        };
    }
};

async function fixConstraint() {
    const { Client } = pg;
    const client = new Client(getDbConfig());
    
    try {
        console.log('🔧 Fixing database constraints...\n');
        await client.connect();
        
        // Drop the old constraint
        console.log('1️⃣ Dropping old status constraint...');
        await client.query('ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check');
        console.log('   ✅ Old constraint removed');
        
        // Add the new constraint
        console.log('\n2️⃣ Adding new status constraint...');
        await client.query(`
            ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check 
            CHECK (status IN ('active', 'inactive', 'coming-soon', 'hidden'))
        `);
        console.log('   ✅ New constraint added');
        
        // Update any 'inactive' statuses to 'hidden'
        console.log('\n3️⃣ Updating status values...');
        const updateResult = await client.query(`
            UPDATE workspaces 
            SET status = 'hidden' 
            WHERE status = 'inactive'
            RETURNING slug, name
        `);
        
        if (updateResult.rowCount > 0) {
            console.log(`   ✅ Updated ${updateResult.rowCount} workspaces from 'inactive' to 'hidden':`);
            updateResult.rows.forEach(row => {
                console.log(`      - ${row.name} (${row.slug})`);
            });
        } else {
            console.log('   ℹ️  No workspaces needed status update');
        }
        
        // Verify the constraint
        console.log('\n4️⃣ Verifying constraint...');
        const constraintCheck = await client.query(`
            SELECT conname, consrc 
            FROM pg_constraint 
            WHERE conname = 'workspaces_status_check'
        `);
        
        if (constraintCheck.rows.length > 0) {
            console.log('   ✅ Constraint verified successfully');
        }
        
        // Show current status distribution
        console.log('\n📊 Current status distribution:');
        const statusCount = await client.query(`
            SELECT status, COUNT(*) as count 
            FROM workspaces 
            GROUP BY status 
            ORDER BY count DESC
        `);
        
        statusCount.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });
        
        console.log('\n✅ Database constraints fixed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

fixConstraint().catch(console.error);