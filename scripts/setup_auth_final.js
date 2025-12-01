
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We are in mv-intel-web/scripts
// .env.local is in mv-intel-web/.env.local (one level up)
const envPath = path.resolve(__dirname, '../.env.local');

console.log('Loading env from:', envPath);

if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found at', envPath);
    process.exit(1);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

async function run() {
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL not found in .env.local');
        process.exit(1);
    }

    console.log('Connecting to Postgres...');
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('✅ Connected.');

        // 1. Create Table
        // Migration is in ../../supabase/migrations/ relative to this script
        const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20251201_allowed_users.sql');
        
        console.log('Reading migration:', migrationPath);
        if (!fs.existsSync(migrationPath)) {
             console.error('❌ Migration file not found at', migrationPath);
             process.exit(1);
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query(sql);
        console.log('✅ Migration applied.');

        // 2. Add Users
        const users = [
            { email: 'harsh.govil@motivepartners.com', name: 'Harsh Govil' },
            { email: 'harsh@motivepartners.com', name: 'Harsh' }
        ];

        for (const user of users) {
            const query = `
                INSERT INTO public.allowed_users (email, name)
                VALUES ($1, $2)
                ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
                RETURNING id;
            `;
            await client.query(query, [user.email, user.name]);
            console.log(`✅ User added: ${user.email}`);
        }

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await client.end();
    }
}

run();
