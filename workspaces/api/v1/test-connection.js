import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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

async function testConnection() {
    const { Client } = pg;
    const config = getDbConfig();
    const client = new Client(config);
    
    console.log('🔧 Testing PostgreSQL connection...');
    console.log('📍 Configuration:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    
    try {
        await client.connect();
        console.log('✅ Successfully connected to PostgreSQL!');
        
        // Test query
        const result = await client.query('SELECT NOW()');
        console.log('⏰ Server time:', result.rows[0].now);
        
        // Check if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('workspaces', 'workspace_metadata')
        `);
        
        if (tablesResult.rows.length === 0) {
            console.log('⚠️  Tables not found. Run "npm run migrate" to create them.');
        } else {
            console.log('✅ Found tables:', tablesResult.rows.map(r => r.table_name).join(', '));
            
            // Count workspaces
            try {
                const countResult = await client.query('SELECT COUNT(*) FROM workspaces');
                console.log(`📊 Workspaces in database: ${countResult.rows[0].count}`);
            } catch (err) {
                console.log('⚠️  Could not count workspaces:', err.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('');
        console.error('Troubleshooting tips:');
        console.error('1. For local development: Make sure EHUB2023 is accessible');
        console.error('2. Check that PostgreSQL is running on port 5432');
        console.error('3. Verify the password is correct');
        console.error('4. For production: Ensure NODE_ENV=production is set');
    } finally {
        await client.end();
    }
}

testConnection().catch(console.error);