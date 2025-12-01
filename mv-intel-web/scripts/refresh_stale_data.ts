
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function refreshStaleEntities() {
    console.log("🔍 Scanning for stale or 'Stealth' entities...");

    // 1. Find people with "Stealth" in their current company
    const { data: stealthPeople, error: err1 } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('type', 'person')
        .or('enrichment_data->>current_employer.ilike.%stealth%,enrichment_data->>current_company.ilike.%stealth%');

    if (err1) console.error("Error finding stealth people:", err1);
    
    console.log(`Found ${stealthPeople?.length || 0} people with 'Stealth' roles.`);

    // 2. Find people not enriched in the last 6 months (Stale)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const { data: stalePeople, error: err2 } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, last_enriched_at')
        .eq('type', 'person')
        .lt('last_enriched_at', sixMonthsAgo.toISOString());

    if (err2) console.error("Error finding stale people:", err2);
    
    console.log(`Found ${stalePeople?.length || 0} stale people (enriched > 6 months ago).`);

    const toRefresh = [...(stealthPeople || []), ...(stalePeople || [])];
    // Deduplicate
    const uniqueIds = new Set(toRefresh.map(p => p.id));
    
    console.log(`\nTotal unique entities to refresh: ${uniqueIds.size}`);

    // Trigger Refresh (Batch of 5 to avoid rate limits if running locally, or just list them for now)
    // In a real scenario, we would loop and call the function.
    // For this demonstration, we will invoke the function for the first few.
    
    const sampleIds = Array.from(uniqueIds).slice(0, 5);
    
    for (const id of sampleIds) {
        const person = toRefresh.find(p => p.id === id);
        console.log(`\nTriggering refresh for: ${person?.name} (${id})`);
        
        const { data, error } = await supabase.functions.invoke('enrich-person-entity', {
            body: { entity_id: id, force_refresh: true }
        });

        if (error) console.error(`Failed: ${error.message}`);
        else console.log(`Success:`, data);
    }
    
    if (uniqueIds.size > 5) {
        console.log(`\n...and ${uniqueIds.size - 5} more. Run this script in a cron job or worker to process all.`);
    }
}

refreshStaleEntities();

