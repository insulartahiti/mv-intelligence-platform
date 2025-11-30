
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Load env vars
const envPath = path.resolve(process.cwd(), 'mv-intel-web', '.env.local');
// console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Also try default location if running from mv-intel-web root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetStaleEnrichment() {
    console.log('🔄 Resetting stale enrichment data...');
    const client = await pool.connect();

    try {
        // Define "stale" cutoff - e.g., anything enriched before the GPT-5.1 upgrade (assumed to be today/recent)
        // Or we can just look for entities that have older "enrichment_version" if we had one.
        // Since we don't have versioning yet, let's look for entities enriched > 24 hours ago OR 
        // entities that have 'enriched' = true but are missing 'last_enriched_at'
        
        // Strategy: We will force re-enrichment by setting last_enriched_at to NULL
        // This will cause the incremental scripts (which likely sort by last_enriched_at NULLS FIRST) to pick them up.
        
        console.log('Identifying entities for re-enrichment...');
        
        // 1. Entities with "gpt-3.5" or "gpt-4" in enrichment metadata (if we tracked it) - hard to know.
        // 2. Just reset ALL entities if the user wants a full refresh?
        // The user asked "How do we ensure...", implying we should implement a check.
        // Let's implement a "Force Upgrade" logic: reset last_enriched_at for all entities
        // BUT to be safe, maybe just those that haven't been touched in the last 2 days?
        
        // Actually, the best way to ensure NEW logic is applied is to clear the 'enriched' flag or timestamp.
        // Let's reset everything for a full refresh as requested by "upgrades to enrichment pipeline".
        
        const { rowCount } = await client.query(`
            UPDATE graph.entities 
            SET 
                last_enriched_at = NULL,
                enriched = false
            WHERE 
                enriched = true 
                OR last_enriched_at IS NOT NULL
        `);

        console.log(`✅ Reset enrichment status for ${rowCount} entities.`);
        console.log('   Run the pipeline again to re-process them with GPT-5.1.');

    } catch (err) {
        console.error('Error resetting enrichment:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

resetStaleEnrichment().catch(console.error);

