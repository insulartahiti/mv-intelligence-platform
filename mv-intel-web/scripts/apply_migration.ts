
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
    console.log('🚀 Applying Migration: 20251129_create_chat_tables.sql');
    
    try {
        const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20251129_create_chat_tables.sql'), 'utf-8');
        
        const client = await pool.connect();
        try {
            await client.query(sql);
            console.log('✅ Migration successfully applied.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

applyMigration();

