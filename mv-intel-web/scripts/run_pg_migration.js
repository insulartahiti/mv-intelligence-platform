
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env.local');
console.log('Loading env from:', envPath);
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

async function run() {
    // Construct connection string from Supabase vars if DATABASE_URL not set
    // Usually Supabase provides a direct postgres connection string
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        // Fallback or error
        console.error('DATABASE_URL not found in .env.local');
        process.exit(1);
    }

    const client = new Client({ connectionString });
    await client.connect();

    const sqlPath = process.argv[2];
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running SQL...');
    try {
        await client.query(sql);
        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

run();
