const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, 'mv-intel-web/.env.local') });

async function createSearchFunction() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to Postgres');

        const sql = fs.readFileSync(
            path.resolve(__dirname, 'create-search-function.sql'),
            'utf8'
        );

        console.log('📝 Creating search_entities function...');
        await client.query(sql);

        console.log('✅ Function created successfully!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

createSearchFunction();
