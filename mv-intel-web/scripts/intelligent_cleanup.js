
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const CONFIDENCE_THRESHOLD = 0.95;
const BATCH_LIMIT = process.argv.includes('--full') ? 1000 : 50; // Default small batch for safety

async function checkDataAssurance() {
    console.log(`🛡️ Starting Intelligent Data Assurance (Dry Run: ${DRY_RUN}, Limit: ${BATCH_LIMIT})...`);

    // 1. Fetch Candidates: Entities with issues OR general audit
    // We prioritize "risky" entities first
    const { data: candidates, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, description, taxonomy, domain, updated_at')
        // Filter for specific issues to prioritize:
        // - Parentheses in name
        // - Missing taxonomy
        // - Stale (> 6 months)
        // - "Stealth" in name
        .or('name.ilike.%(%),name.ilike.%stealth%,taxonomy.is.null,updated_at.lt.2025-06-01') 
        .order('updated_at', { ascending: true }) // Oldest first
        .limit(BATCH_LIMIT);

    if (error) {
        console.error('Error fetching candidates:', error);
        return;
    }

    console.log(`🔍 Analyzing ${candidates.length} candidates...`);

    let stats = { merged: 0, retyped: 0, retax: 0, badUrls: 0, stale: 0 };

    for (const entity of candidates) {
        console.log(`\n🧐 Analyzing: ${entity.name} [${entity.type}] (ID: ${entity.id.substring(0,8)}...)`);

        // Check 1: Parenthetical / Duplicate Check (Merge)
        if (entity.name.includes('(') || entity.name.toLowerCase().includes('stealth')) {
            const merged = await checkDuplicateAndMerge(entity);
            if (merged) {
                stats.merged++;
                continue; // Entity deleted/merged, skip other checks
            }
        }

        // Check 2: Type Verification
        const retyped = await verifyType(entity);
        if (retyped) stats.retyped++;

        // Check 3: Taxonomy Validation
        const retax = await validateTaxonomy(entity);
        if (retax) stats.retax++;

        // Check 4: Broken URLs
        const badUrl = await checkUrl(entity);
        if (badUrl) stats.badUrls++;

        // Check 5: Stale Data
        const stale = await checkStale(entity);
        if (stale) stats.stale++;
    }

    console.log('\n📊 Assurance Summary:', stats);
}

async function checkDuplicateAndMerge(entity) {
    const cleanName = entity.name.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\(?stealth\)?/gi, '').trim();
    
    if (cleanName.length > 2 && cleanName.toLowerCase() !== entity.name.toLowerCase()) {
        const { data: matches } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type, description')
            .ilike('name', cleanName)
            .neq('id', entity.id);

        if (matches && matches.length > 0) {
            const target = matches[0];
            return await evaluateMerge(entity, target);
        }
    }
    return false;
}

async function validateTaxonomy(entity) {
    if (!entity.taxonomy || entity.taxonomy === 'Other' || !entity.taxonomy.includes('.')) {
        // Only re-classify organizations
        if (entity.type !== 'organization') return false;

        console.log(`   🏷️ Invalid Taxonomy: "${entity.taxonomy}". Re-classifying...`);
        if (DRY_RUN) return false;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-5.1",
                messages: [
                    { role: "system", content: "Classify into IFT taxonomy (e.g. IFT.PAY.B2B). Return JSON: { taxonomy: string }" },
                    { role: "user", content: `Entity: ${entity.name}\nDesc: ${entity.description || 'Unknown'}` }
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(completion.choices[0].message.content);
            if (result.taxonomy && result.taxonomy.includes('.')) {
                await supabase.schema('graph').from('entities').update({ taxonomy: result.taxonomy }).eq('id', entity.id);
                console.log(`      ✅ Updated Taxonomy to ${result.taxonomy}`);
                return true;
            }
        } catch (e) {
            // ignore
        }
    }
    return false;
}

async function checkUrl(entity) {
    if (entity.domain && !entity.domain.includes('.')) {
        console.log(`   🔗 Invalid Domain format: ${entity.domain}`);
        return true;
    }
    return false;
}

async function checkStale(entity) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    if (new Date(entity.updated_at) < sixMonthsAgo) {
        console.log(`   🕰️ Stale Data (Last updated: ${entity.updated_at}). Flagging for refresh.`);
        // In real run, we would trigger re-enrichment here or add to a queue
        return true;
    }
    return false;
}


async function evaluateMerge(source, target) {
    console.log(`   👉 Potential Merge: "${source.name}" -> "${target.name}"`);

    // Ask LLM
    const prompt = `
    I have two entities in my database.
    Entity A: ID=${source.id}, Name="${source.name}", Type="${source.type}", Desc="${source.description || ''}"
    Entity B: ID=${target.id}, Name="${target.name}", Type="${target.type}", Desc="${target.description || ''}"

    Task: Determine if Entity A should be merged into Entity B (or vice versa), or if they are distinct.
    
    Rules:
    - "Name (Stealth)" usually merges into "Name".
    - "Name (Company)" merges into "Name".
    - "Person (Company)" usually merges into "Person" IF both are People, OR "Company" if Type is Org and it's misnamed.
    - If they are distinct (e.g. "Apple" vs "Apple Corps"), return DISTINCT.

    Return JSON:
    {
        "decision": "MERGE_A_INTO_B" | "MERGE_B_INTO_A" | "DISTINCT" | "UNCERTAIN",
        "confidence": 0.0 to 1.0,
        "reason": "explanation"
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-5.1", // Or gpt-4o
            messages: [{ role: "system", content: "You are a data integrity expert." }, { role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        console.log(`      🤖 Decision: ${result.decision} (Confidence: ${result.confidence}) - ${result.reason}`);

        if (result.decision.startsWith('MERGE') && result.confidence >= CONFIDENCE_THRESHOLD) {
            const [keep, remove] = result.decision === 'MERGE_A_INTO_B' ? [target, source] : [source, target];
            await executeMerge(keep, remove);
        }

    } catch (e) {
        console.error('      ❌ LLM Error:', e.message);
    }
}

async function verifyType(entity) {
    // Only check suspicious cases
    const isPersonName = (n) => !n.includes('Inc') && !n.includes('Ltd') && !n.includes('LLC') && !n.includes('Technologies');
    
    if (entity.type === 'organization' && isPersonName(entity.name)) {
        // Potential misclassification
        console.log(`   🤔 Type Mismatch? "${entity.name}" is marked as Organization.`);
        if (DRY_RUN) return false;
        
        // Ask LLM
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-5.1",
                messages: [
                    { role: "system", content: "Is this entity a 'person' or 'organization'? Return JSON: { type: 'person' | 'organization' }" },
                    { role: "user", content: `Name: ${entity.name}\nDesc: ${entity.description || ''}` }
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(completion.choices[0].message.content);
            if (result.type !== entity.type) {
                console.log(`      ✏️ Changing type to ${result.type}`);
                await supabase.schema('graph').from('entities').update({ type: result.type }).eq('id', entity.id);
                return true;
            }
        } catch(e) {}
    }
    return false;
}

async function executeMerge(keep, remove) {
    if (DRY_RUN) {
        console.log(`      [DRY RUN] Would merge ${remove.id} (${remove.name}) into ${keep.id} (${keep.name})`);
        return;
    }

    console.log(`      ⚡ Merging ${remove.id} -> ${keep.id}...`);
    
    // 1. Move Interactions
    const { error: intError } = await supabase.schema('graph').from('interactions')
        .update({ entity_id: keep.id, company_id: keep.type === 'organization' ? keep.id : null })
        .eq('entity_id', remove.id);
    
    // 2. Move Edges (Source)
    const { error: edgeSrcError } = await supabase.schema('graph').from('edges')
        .update({ source: keep.id })
        .eq('source', remove.id);

    // 3. Move Edges (Target)
    const { error: edgeTgtError } = await supabase.schema('graph').from('edges')
        .update({ target: keep.id })
        .eq('target', remove.id);

    // 4. Delete Old Entity
    const { error: delError } = await supabase.schema('graph').from('entities')
        .delete()
        .eq('id', remove.id);

    if (intError || edgeSrcError || edgeTgtError || delError) {
        console.error('      ❌ Merge Failed (DB Error)');
    } else {
        console.log('      ✅ Merge Complete');
    }
}

checkDataAssurance().catch(console.error);

