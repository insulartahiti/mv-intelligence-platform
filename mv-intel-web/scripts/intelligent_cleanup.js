
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

async function checkDataAssurance() {
    console.log(`🛡️ Starting Intelligent Data Assurance (Dry Run: ${DRY_RUN})...`);

    // 1. Fetch Candidates: Entities with parentheses or suspected type mismatches
    // We fetch a batch to process
    const { data: candidates, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, description, taxonomy')
        .or('name.ilike.%(%),name.ilike.%stealth%') // Initial filter for obvious issues
        .limit(50);

    if (error) {
        console.error('Error fetching candidates:', error);
        return;
    }

    console.log(`🔍 Analyzing ${candidates.length} candidates...`);

    for (const entity of candidates) {
        console.log(`\n🧐 Analyzing: ${entity.name} [${entity.type}]`);

        // Check 1: Parenthetical / Duplicate Check
        if (entity.name.includes('(')) {
            const cleanName = entity.name.replace(/\s*\(.*?\)\s*/g, '').trim();
            if (cleanName.length > 2) {
                // Find potential canonical match
                const { data: matches } = await supabase
                    .schema('graph')
                    .from('entities')
                    .select('id, name, type, description')
                    .ilike('name', cleanName) // Exact match on clean name
                    .neq('id', entity.id); // Not self

                if (matches && matches.length > 0) {
                    const target = matches[0]; // Take best match
                    await evaluateMerge(entity, target);
                    continue; // Skip other checks if merging
                }
            }
        }

        // Check 2: Type Verification (Is Org actually Person?)
        await verifyType(entity);
    }
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
    // Skip if LLM check is expensive, maybe sample?
    // prompt: Is "${entity.name}" likely a ${entity.type}?
    // For now, let's skip to save tokens unless requested.
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

