import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PORTFOLIO_STAGES = [
    'Portfolio MVF1',
    'Portfolio MVF2',
    'Motive AAV',
    'Balance Sheet/Former Funds',
    'Exited',
    'Portfolio'
];

async function main() {
    console.log('Fixing Portfolio Flags...');

    // 1. Update Organizations based on pipeline_stage
    console.log('Updating Organizations...');
    const { data: stages } = await supabase
        .schema('graph')
        .from('entities')
        .select('pipeline_stage')
        .not('pipeline_stage', 'is', null);
    
    // Build implicit list of stages to be safe (checking partial matches)
    // Actually, let's just do direct updates for known stages
    
    for (const stage of PORTFOLIO_STAGES) {
        const { error, count } = await supabase
            .schema('graph')
            .from('entities')
            .update({ is_portfolio: true })
            .eq('type', 'organization')
            .ilike('pipeline_stage', `%${stage}%`) // Partial match safer
            .select('id', { count: 'exact' });
        
        if (error) console.error(`Error updating stage "${stage}":`, error.message);
        else console.log(`Updated ${count} entities for stage "${stage}"`);
    }

    // 2. Propagate to Founders / Owners / Deal Team
    console.log('\nPropagating to Connected People (Founders, Owners, Deal Team)...');
    
    // Get all portfolio organization IDs
    const { data: portfolioOrgs } = await supabase
        .schema('graph')
        .from('entities')
        .select('id')
        .eq('is_portfolio', true)
        .eq('type', 'organization');

    if (!portfolioOrgs || portfolioOrgs.length === 0) {
        console.log('No portfolio organizations found.');
        return;
    }

    const orgIds = portfolioOrgs.map(o => o.id);
    
    // Find edges
    const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, kind')
        .in('target', orgIds)
        .in('kind', ['founder', 'owner', 'deal_team', 'works_at']);

    if (!edges || edges.length === 0) {
        console.log('No connected people found.');
        return;
    }

    // Filter for relevant roles. "works_at" is broad, but for Portfolio companies, usually key people are relevant.
    // But user said "founders". Let's stick to 'founder' and 'owner' for STRONG signal, 
    // maybe 'works_at' is too broad (includes all employees)? 
    // User said "Marcel... founder of Februar".
    // Let's prioritize 'founder', 'owner'. 
    // User also said "Founders" in chat.
    
    const relevantEdges = edges.filter(e => ['founder', 'owner', 'deal_team'].includes(e.kind));
    const personIds = [...new Set(relevantEdges.map(e => e.source))];

    console.log(`Found ${personIds.length} connected people (Founders/Owners/DealTeam). Updating in batches...`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
        const batch = personIds.slice(i, i + BATCH_SIZE);
        const { error: updateError } = await supabase
            .schema('graph')
            .from('entities')
            .update({ is_portfolio: true })
            .in('id', batch)
            .eq('type', 'person');
            
        if (updateError) {
            console.error(`Error updating batch ${i}:`, updateError.message);
        } else {
            console.log(`Updated batch ${i/BATCH_SIZE + 1}`);
        }
    }
}

main();

