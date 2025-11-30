
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSyncState() {
    console.log('🔍 Checking Sync State...');
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT * FROM graph.sync_state 
            ORDER BY last_sync_timestamp DESC 
            LIMIT 5
        `);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSyncState();

