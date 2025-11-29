import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function updateSchema() {
    console.log('🚀 Updating database schema to 3072 dimensions...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing in .env.local');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL database');

        const sqlPath = path.join(process.cwd(), 'update_to_3072_dimensions.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split into individual statements
        const statements = sql.split(';').filter(s => s.trim().length > 0);

        for (const statement of statements) {
            console.log(`Executing: ${statement.trim().substring(0, 50)}...`);
            await client.query(statement);
        }

        console.log('✅ Schema update completed successfully');
    } catch (error) {
        console.error('❌ Schema update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

updateSchema();
