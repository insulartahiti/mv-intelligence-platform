import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'mv-intel-web/.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateSummaries() {
    console.log('🚀 Starting Legacy AI Summary Backfill...');

    // Count total to process
    const { count } = await supabase.schema('graph').from('entities')
        .select('*', { count: 'exact', head: true })
        .not('business_analysis', 'is', null);
    
    console.log(`Found ${count} entities with business analysis to check.`);

    const pageSize = 100;
    let page = 0;
    let processed = 0;
    let updated = 0;

    while (true) {
        const { data, error } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type, business_analysis, ai_summary')
            .not('business_analysis', 'is', null)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching batch:', error);
            break;
        }
        if (!data || data.length === 0) break;

        for (const entity of data) {
            const ba = entity.business_analysis;
            let newSummary = null;

            if (!ba) continue;

            if (typeof ba === 'string') {
                // Handle potential stringified JSON
                try {
                    const parsed = JSON.parse(ba);
                    newSummary = parsed.summary || parsed.core_business || parsed.key_achievements;
                } catch (e) { /* ignore */ }
            } else {
                // Handle object
                newSummary = ba.summary || ba.core_business || ba.key_achievements;
            }

            // If we found a better summary, and it's different or ai_summary is missing, update it
            if (newSummary && (typeof newSummary === 'string') && newSummary !== entity.ai_summary) {
                const { error: updateError } = await supabase
                    .schema('graph')
                    .from('entities')
                    .update({ ai_summary: newSummary })
                    .eq('id', entity.id);
                
                if (updateError) {
                    console.error(`Failed to update ${entity.name}:`, updateError.message);
                } else {
                    updated++;
                    // console.log(`Updated ${entity.name}`);
                }
            }
            processed++;
        }

        console.log(`Processed ${processed}/${count} entities...`);
        page++;
        await new Promise(r => setTimeout(r, 100)); // Rate limit nice
    }

    console.log(`\n✅ Migration Complete! Updated ${updated} entities.`);
}

migrateSummaries().catch(console.error);

