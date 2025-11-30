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

async function main() {
    console.log('Checking pipeline_stage values...');

    // 1. Get unique pipeline stages and their counts
    const { data: stages, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('pipeline_stage');

    if (error) {
        console.error('Error fetching stages:', error);
        return;
    }

    const stageCounts: Record<string, number> = {};
    let portfolioCount = 0;
    let isPortfolioTrueCount = 0;

    stages.forEach((row: any) => {
        const stage = row.pipeline_stage || 'NULL';
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        if (stage === 'Portfolio' || stage === 'portfolio') portfolioCount++;
    });

    console.log('Pipeline Stages Distribution:', stageCounts);

    // 2. Check is_portfolio flag
    const { count } = await supabase
        .schema('graph')
        .from('entities')
        .select('id', { count: 'exact', head: true })
        .eq('is_portfolio', true);
    
    isPortfolioTrueCount = count || 0;

    console.log(`\nEntities with pipeline_stage='Portfolio': ${portfolioCount}`);
    console.log(`Entities with is_portfolio=true: ${isPortfolioTrueCount}`);

    // 3. Check Enrichment Data for Funds (Sample)
    console.log('\nChecking Enrichment Data for "Motive" mentions...');
    const { data: enrichedSample } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, enrichment_data, business_analysis')
        .eq('type', 'organization')
        .limit(5);

    enrichedSample?.forEach(e => {
        const hasMotive = JSON.stringify(e).toLowerCase().includes('motive');
        if (hasMotive) {
            console.log(`- ${e.name} mentions Motive`);
        }
    });
}

main();

