import { createClient } from '@supabase/supabase-js';
import neo4j from 'neo4j-driver';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function verify() {
    console.log('🔐 Verifying Credentials...');
    let allGood = true;

    // 1. Affinity
    if (!process.env.AFFINITY_API_KEY) {
        console.error('❌ Affinity: Missing API Key');
        allGood = false;
    } else {
        try {
            const auth = Buffer.from(`:${process.env.AFFINITY_API_KEY}`).toString('base64');
            await axios.get('https://api.affinity.co/auth/whoami', {
                headers: { Authorization: `Basic ${auth}` }
            });
            console.log('✅ Affinity API: Connected');
        } catch (e: any) {
            console.error('❌ Affinity API: Failed -', e.response?.statusText || e.message);
            allGood = false;
        }
    }

    // 2. Neo4j
    if (!process.env.NEO4J_URI) {
        console.error('❌ Neo4j: Missing URI');
        allGood = false;
    } else {
        try {
            const driver = neo4j.driver(
                process.env.NEO4J_URI!,
                neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
            );
            await driver.verifyConnectivity();
            console.log('✅ Neo4j: Connected');
            await driver.close();
        } catch (e: any) {
            console.error('❌ Neo4j: Failed -', e.message);
            allGood = false;
        }
    }

    // 3. Supabase
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error('❌ Supabase: Missing URL');
        allGood = false;
    } else {
        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            const { error } = await supabase.schema('graph').from('sync_state').select('id').limit(1);
            if (error) throw error;
            console.log('✅ Supabase: Connected');
        } catch (e: any) {
            console.error('❌ Supabase: Failed -', e.message);
            allGood = false;
        }
    }

    if (!allGood) {
        console.log('\n⚠️  ACTION REQUIRED: Fix .env.local keys, then update GitHub Secrets.');
        process.exit(1);
    } else {
        console.log('\n🎉 All credentials valid locally. Please ensure these EXACT values are in GitHub Secrets.');
    }
}

verify();

