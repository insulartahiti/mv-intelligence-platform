
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.resolve(__dirname, '../../.env'); // Check root .env first
const localEnvPath = path.resolve(__dirname, '../.env.local');

dotenv.config({ path: envPath });
dotenv.config({ path: localEnvPath, override: true }); // Local overrides root

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// Configuration
const args = process.argv.slice(2);
const FULL_SCAN = args.includes('--full');
const MONTHS = args.includes('--months') ? parseInt(args[args.indexOf('--months') + 1]) : 3;
const CONFIDENCE_THRESHOLD = 0.95;
const BATCH_LIMIT = FULL_SCAN ? 1000 : 50; 

async function checkDataAssurance() {
    console.log(`🛡️ Starting Intelligent Data Assurance (Full: ${FULL_SCAN}, Stale: >${MONTHS}m, Limit: ${BATCH_LIMIT})...`);

    // Calculate stale date
    const staleDate = new Date();
    staleDate.setMonth(staleDate.getMonth() - MONTHS);
    const staleIso = staleDate.toISOString();

    // 1. Fetch Candidates
    let query = supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, description, taxonomy, domain, updated_at, location_city, location_country, business_analysis, enrichment_data');

    // Build filter logic
    if (FULL_SCAN) {
        // In full scan, we look for ANY issue
        query = query.or(`name.ilike.%(%),name.ilike.%stealth%,taxonomy.is.null,location_country.is.null,updated_at.lt.${staleIso}`);
    } else {
        // Weekly maintenance: Focus on older entities
        query = query.lt('updated_at', staleIso);
    }

    const { data: candidates, error } = await query
        .order('updated_at', { ascending: true }) // Process oldest first
        .limit(BATCH_LIMIT);

    if (error) {
        console.error('Error fetching candidates:', error);
        return;
    }

    console.log(`🔍 Analyzing ${candidates.length} candidates...`);

    let stats = { merged: 0, retyped: 0, retax: 0, badUrls: 0, stale: 0, locEnriched: 0 };

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

        // Check 5: Location Enrichment (New)
        const loc = await enrichLocation(entity);
        if (loc) stats.locEnriched++;

        // Check 6: Stale Data
        const stale = await checkStale(entity);
        if (stale) stats.stale++;
    }

    // Check 6: Fix Fake Founders (Stand-alone check)
    await fixFakeFounders();

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
        console.log(`   🕰️ Stale Data (Last updated: ${entity.updated_at}). Queueing for re-enrichment...`);
        
        // Clear enrichment flags to trigger re-enrichment on next pipeline run
        const { error } = await supabase
            .schema('graph')
            .from('entities')
            .update({ 
                enriched: false, 
                enrichment_source: null,
                relationships_extracted_at: null // Also re-extract relationships
            })
            .eq('id', entity.id);
        
        if (error) {
            console.error(`      ❌ Failed to queue ${entity.id} for re-enrichment: ${error.message}`);
            return false;
        }
        
        console.log(`      ✅ Queued for re-enrichment`);
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

async function enrichLocation(entity) {
    // Only run if location is completely missing or incomplete
    if (entity.location_country && entity.location_city) return false;

    // Don't waste tokens on entities with no descriptive data
    const hasData = entity.description || entity.business_analysis || entity.enrichment_data;
    if (!hasData && !perplexityApiKey) return false;

    console.log(`   🌍 Missing Location (Current: ${entity.location_city || '?'}, ${entity.location_country || '?'}). Inferring...`);

    let result = { city: null, country: null, confidence: 0 };

    // 1. Try Internal Data (GPT-5.1)
    if (hasData) {
        try {
            const prompt = `
            Analyze the entity data below and extract the Primary Headquarters Location.
            
            Entity: ${entity.name} (${entity.type})
            Description: ${entity.description || ''}
            Analysis: ${JSON.stringify(entity.business_analysis || {}).substring(0, 500)}
            Metadata: ${JSON.stringify(entity.enrichment_data || {}).substring(0, 500)}

            Return JSON:
            {
                "city": "City Name" (or "City A, City B" if multiple major hubs),
                "country": "Country Name" (e.g. "United States", "Germany", "United Kingdom"),
                "confidence": 0.0 to 1.0
            }
            
            If location is unknown, return null for city/country.
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-5.1",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });

            result = JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            // ignore internal error
        }
    }

    // 2. Fallback: External Search (Perplexity)
    if ((!result.city && !result.country) || result.confidence < 0.7) {
        if (perplexityApiKey) {
            console.log(`      🌐 Internal data insufficient. Searching Perplexity...`);
            try {
                const ppRes = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${perplexityApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'sonar-pro',
                        messages: [
                            { role: 'system', content: 'You are a precise data enrichment assistant. Return ONLY JSON.' },
                            { role: 'user', content: `Where is the headquarters of ${entity.name} (${entity.type})? Return JSON: { "city": "City", "country": "Country" }` }
                        ]
                    })
                });
                
                if (ppRes.ok) {
                    const data = await ppRes.json();
                    const content = data.choices[0].message.content;
                    // Extract JSON from potential markdown code block
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const ppResult = JSON.parse(jsonMatch[0]);
                        if (ppResult.city || ppResult.country) {
                            result = { ...ppResult, confidence: 0.9 };
                        }
                    }
                }
            } catch (e) {
                console.error(`      ❌ Perplexity Error: ${e.message}`);
            }
        }
    }

    if (result.confidence > 0.7 && (result.city || result.country)) {
        const updates: any = {};
        if (result.city && !entity.location_city) updates.location_city = result.city;
        if (result.country && !entity.location_country) updates.location_country = result.country;

        if (Object.keys(updates).length > 0) {
            console.log(`      📍 Found Location: ${updates.location_city || ''}, ${updates.location_country || ''}`);
            await supabase.schema('graph').from('entities').update(updates).eq('id', entity.id);
            return true;
        }
    }
    return false;
}

async function fixFakeFounders() {
    console.log('\n👮‍♀️ Verifying Founder Edges...');
    // 1. Get Founder Edges
    const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, source_entity:source(id, name, enrichment_data, business_analysis)')
        .eq('kind', 'founder')
        .limit(FULL_SCAN ? 2000 : 200); // Process in batches

    if (error) {
        console.error('Error fetching founder edges:', error);
        return;
    }

    if (!edges || edges.length === 0) return;

    let fixed = 0;
    for (const edge of edges) {
        const personData = edge.source_entity;
        // Handle potential array return from Supabase join
        const person = Array.isArray(personData) ? personData[0] : personData;
        
        if (!person) continue;

        const title = (
            person.enrichment_data?.title || 
            person.enrichment_data?.role || 
            person.business_analysis?.seniority_level || 
            ''
        ).toLowerCase();

        // If title is missing, skipping to be safe.
        if (title && title.length > 2) {
            const isFounder = title.includes('founder') || title.includes('ceo') || title.includes('owner') || title.includes('partner') || title.includes('president') || title.includes('chairman');
            const isEmployee = title.includes('manager') || title.includes('lead') || title.includes('associate') || title.includes('analyst') || title.includes('developer') || title.includes('engineer') || title.includes('recruiter') || title.includes('specialist') || title.includes('consultant');

            if (!isFounder && isEmployee) {
                console.log(`   📉 Downgrading ${person.name} (${title}) from FOUNDER to WORKS_AT`);
                
                const { error: updateError } = await supabase.schema('graph').from('edges')
                    .update({ 
                        kind: 'works_at', 
                        metadata: { source_fix: 'intelligent_cleanup', original_kind: 'founder', reason: 'title_mismatch' } 
                    })
                    .eq('id', edge.id);
                
                if (!updateError) fixed++;
            }
        }
    }
    console.log(`   ✅ Downgraded ${fixed} fake founders.`);
}

async function executeMerge(keep, remove) {
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
