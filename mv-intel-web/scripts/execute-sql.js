const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in .env.local');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to Postgres');

        const sqlPath = path.resolve(__dirname, '../../add_linkedin_edge_type.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📝 Executing SQL...');
        await client.query(sql);

        console.log('✅ Successfully updated edge constraints!');
    } catch (err) {
        console.error('❌ Error executing SQL:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
