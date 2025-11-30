const { createClient } = require('@supabase/supabase-js');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

// Load .env
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../../.env.local')
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

// Use Supabase Client instead of PG Pool to bypass DNS/Direct Connection issues
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function cleanGarbage() {
  console.log('🗑️  Starting Garbage Cleanup...');
  const session = driver.session();

  try {
    // 1. Delete Merged Names (Email artifacts)
    const { data: mergedDeleted, error: mergedError } = await supabase
      .schema('graph')
      .from('entities')
      .delete()
      .or('name.like.%;%,name.like.%<%,name.like.%>%,name.like.%|%')
      .select('id, name');

    if (mergedError) {
        console.error('Error deleting merged names:', mergedError);
    } else {
        console.log(`   - Deleted ${mergedDeleted ? mergedDeleted.length : 0} merged/email artifact entities from Postgres.`);
    }

    // 2. Delete Generic/Job Title Nodes
    const garbageNames = [
        'CEO', 'CTO', 'CFO', 'COO', 'Founder', 'Co-Founder', 
        'Advisor', 'Board Member', 'Investor', 'Partner', 'Principal',
        'Director', 'Manager', 'Vice President', 'President',
        'Chairman', 'Head of', 'Lead', 'Senior', 'Junior',
        'PhD', 'MBA', 'CFA', 'CPA', 'JD', 'MD'
    ];
    
    // Deleting via Supabase is trickier with "ANY" array logic, so we iterate or use simplified logic
    // We'll fetch candidates first then delete by ID to be safe and use client-side logic
    const { data: candidates } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name');

    if (candidates) {
        const toDelete = candidates.filter(c => {
            if (garbageNames.includes(c.name)) return true;
            if (c.name.includes('CEO)') || c.name.includes('Advisor)') || c.name.includes('Manager)')) return true;
            return false;
        }).map(c => c.id);

        if (toDelete.length > 0) {
            const { error: delError } = await supabase.schema('graph').from('entities').delete().in('id', toDelete);
            if (!delError) console.log(`   - Deleted ${toDelete.length} generic title entities.`);
        }
    }

    // 3. Neo4j Cleanup (Mirror Postgres)
    await session.run(`
      MATCH (n:Entity)
      WHERE n.name CONTAINS ';' 
         OR n.name CONTAINS '<' 
         OR n.name CONTAINS '>'
         OR n.name IN $garbageNames
         OR n.name ENDS WITH ')'
      DETACH DELETE n
    `, { garbageNames });
    console.log(`   - Synced cleanup with Neo4j.`);

  } finally {
    await session.close();
  }
}

async function deduplicatePeople() {
  console.log('👯 Starting Person Deduplication...');
  
  try {
    // Find duplicates by name using RPC or raw client logic (Supabase doesn't support GROUP BY easily in client)
    // We'll fetch all people and group in memory (not ideal for huge datasets but works for <50k entities)
    // OR: We define an RPC function. Let's try memory first for simplicity since we want to avoid migrations if possible.
    
    // Fetch limited fields for all people
    let allPeople = [];
    let page = 0;
    const pageSize = 1000;
    
    while(true) {
        const { data, error } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, business_analysis, domain, enriched, enrichment_source')
            .eq('type', 'person')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error || !data || data.length === 0) break;
        allPeople = allPeople.concat(data);
        page++;
    }

    const grouped = {};
    allPeople.forEach(p => {
        const key = p.name ? p.name.toLowerCase() : 'unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
    });

    const duplicates = Object.values(grouped).filter(g => g.length > 1);
    console.log(`   - Found ${duplicates.length} names with duplicates.`);

    for (const group of duplicates) {
      // Score them
      const scored = await Promise.all(group.map(async (e) => {
        let score = 0;
        
        // Valid Analysis
        if (e.business_analysis && !JSON.stringify(e.business_analysis).includes('Insufficient information')) {
            score += 10;
        }
        
        // Domain present
        if (e.domain) score += 5;
        
        // Enriched
        if (e.enriched) score += 2;

        // Edge count 
        const { count } = await supabase
            .schema('graph')
            .from('edges')
            .select('*', { count: 'exact', head: true })
            .or(`source.eq.${e.id},target.eq.${e.id}`);
            
        score += (count || 0);

        return { ...e, score };
      }));

      // Sort desc by score
      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0];
      const losers = scored.slice(1);

      console.log(`   Processing "${winner.name}": Keeping ID ${winner.id} (Score ${winner.score}), removing ${losers.length} others.`);

      // Merge Edges from Losers to Winner
      for (const loser of losers) {
        // Move Edges
        // 1. Outgoing
        const { data: outEdges } = await supabase.schema('graph').from('edges').select('*').eq('source', loser.id);
        if (outEdges) {
            for (const edge of outEdges) {
                // Check if exists
                const { data: existing } = await supabase.schema('graph').from('edges').select('id').match({ source: winner.id, target: edge.target, kind: edge.kind });
                if (existing && existing.length > 0) {
                     await supabase.schema('graph').from('edges').delete().eq('id', edge.id);
                } else {
                     await supabase.schema('graph').from('edges').update({ source: winner.id }).eq('id', edge.id);
                }
            }
        }

        // 2. Incoming
        const { data: inEdges } = await supabase.schema('graph').from('edges').select('*').eq('target', loser.id);
        if (inEdges) {
            for (const edge of inEdges) {
                // Check if exists
                const { data: existing } = await supabase.schema('graph').from('edges').select('id').match({ source: edge.source, target: winner.id, kind: edge.kind });
                if (existing && existing.length > 0) {
                     await supabase.schema('graph').from('edges').delete().eq('id', edge.id);
                } else {
                     await supabase.schema('graph').from('edges').update({ target: winner.id }).eq('id', edge.id);
                }
            }
        }

        // Delete Loser Entity
        await supabase.schema('graph').from('entities').delete().eq('id', loser.id);
        
        // Delete from Neo4j
        const session = driver.session();
        try {
            await session.run('MATCH (n) WHERE n.id = $id DETACH DELETE n', { id: loser.id });
        } finally {
            await session.close();
        }
      }
    }
  } catch(e) {
      console.error(e);
  }
}

async function deduplicateOrganizations() {
  console.log('🏢 Starting Organization Deduplication...');
  
  try {
    // Fetch all orgs
    let allOrgs = [];
    let page = 0;
    const pageSize = 1000;
    
    while(true) {
        const { data, error } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, business_analysis, domain, enriched, enrichment_source')
            .eq('type', 'organization')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error || !data || data.length === 0) break;
        allOrgs = allOrgs.concat(data);
        page++;
    }

    const grouped = {};
    allOrgs.forEach(p => {
        const key = p.name ? p.name.toLowerCase() : 'unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
    });

    const duplicates = Object.values(grouped).filter(g => g.length > 1);
    console.log(`   - Found ${duplicates.length} organization names with duplicates.`);

    for (const group of duplicates) {
      const scored = await Promise.all(group.map(async (e) => {
        let score = 0;
        if (e.business_analysis && !JSON.stringify(e.business_analysis).includes('Unknown')) score += 10;
        if (e.domain) score += 5;
        if (e.enriched) score += 2;
        
        const { count } = await supabase.schema('graph').from('edges').select('*', { count: 'exact', head: true }).or(`source.eq.${e.id},target.eq.${e.id}`);
        score += (count || 0);

        return { ...e, score };
      }));

      scored.sort((a, b) => b.score - a.score);
      const winner = scored[0];
      const losers = scored.slice(1);

      console.log(`   Processing "${winner.name}": Keeping ID ${winner.id} (Score ${winner.score}), removing ${losers.length} others.`);

      for (const loser of losers) {
        // 1. Outgoing
        const { data: outEdges } = await supabase.schema('graph').from('edges').select('*').eq('source', loser.id);
        if (outEdges) {
            for (const edge of outEdges) {
                const { data: existing } = await supabase.schema('graph').from('edges').select('id').match({ source: winner.id, target: edge.target, kind: edge.kind });
                if (existing && existing.length > 0) {
                     await supabase.schema('graph').from('edges').delete().eq('id', edge.id);
                } else {
                     await supabase.schema('graph').from('edges').update({ source: winner.id }).eq('id', edge.id);
                }
            }
        }

        // 2. Incoming
        const { data: inEdges } = await supabase.schema('graph').from('edges').select('*').eq('target', loser.id);
        if (inEdges) {
            for (const edge of inEdges) {
                const { data: existing } = await supabase.schema('graph').from('edges').select('id').match({ source: edge.source, target: winner.id, kind: edge.kind });
                if (existing && existing.length > 0) {
                     await supabase.schema('graph').from('edges').delete().eq('id', edge.id);
                } else {
                     await supabase.schema('graph').from('edges').update({ target: winner.id }).eq('id', edge.id);
                }
            }
        }

        // Delete Loser
        await supabase.schema('graph').from('entities').delete().eq('id', loser.id);
        
        const session = driver.session();
        try {
            await session.run('MATCH (n) WHERE n.id = $id DETACH DELETE n', { id: loser.id });
        } finally {
            await session.close();
        }
      }
    }
  } catch (e) {
      console.error(e);
  }
}

async function main() {
  try {
    await cleanGarbage();
    await deduplicatePeople();
    await deduplicateOrganizations();
    console.log('✅ Systematic Cleanup Complete.');
  } catch (err) {
    console.error('Cleanup Failed:', err);
  } finally {
    await driver.close();
  }
}

main();

