
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPipelineStatus() {
    console.log('🔍 Checking Pipeline Health...');

    // 1. Check Sync State
    const { data: state } = await supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

    console.log('\n📊 Pipeline State:');
    console.log(state && state[0] ? JSON.stringify(state[0], null, 2) : 'No state found');

    // 2. Check Entity Enrichment Progress
    // Enriched means 'business_analysis' is populated
    const { count: totalEntities } = await supabase.schema('graph').from('entities').select('*', { count: 'exact', head: true });
    const { count: enrichedEntities } = await supabase.schema('graph').from('entities').select('*', { count: 'exact', head: true }).not('business_analysis', 'is', null);
    
    console.log('\n🏢 Entity Enrichment:');
    console.log(`   - Total Entities: ${totalEntities}`);
    console.log(`   - Enriched: ${enrichedEntities} (${((enrichedEntities / totalEntities) * 100).toFixed(1)}%)`);

    // 3. Check Interaction Summarization
    // Count rollup entries
    const { count: summaries } = await supabase.schema('graph').from('entity_notes_rollup').select('*', { count: 'exact', head: true });
    
    console.log('\n📝 Interaction Summaries:');
    console.log(`   - Generated Summaries: ${summaries}`);

    // 4. Check Interaction Embeddings
    const { count: totalInteractions } = await supabase.schema('graph').from('interactions').select('*', { count: 'exact', head: true });
    const { count: embeddedInteractions } = await supabase.schema('graph').from('interactions').select('*', { count: 'exact', head: true }).not('embedding', 'is', null);

    console.log('\n⚡ Interaction Embeddings:');
    console.log(`   - Total Interactions: ${totalInteractions}`);
    console.log(`   - Embedded: ${embeddedInteractions} (${((embeddedInteractions / totalInteractions) * 100).toFixed(1)}%)`);
}

checkPipelineStatus();

