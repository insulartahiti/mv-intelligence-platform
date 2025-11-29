const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
    // Check for LinkedIn edges in Postgres
    const { data: linkedinEdges, count: linkedinCount } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'linkedin_connection');

    console.log('\n🔍 LinkedIn Data in Postgres:');
    console.log(`  - LinkedIn edges: ${linkedinCount || 0}`);

    // Check edge types
    const { data: edgeTypes } = await supabase
        .schema('graph')
        .from('edges')
        .select('kind')
        .limit(1000);

    const kinds = [...new Set(edgeTypes.map(e => e.kind))];
    console.log(`\n  - Edge types found: ${kinds.join(', ')}`);

    // Check entities with embeddings
    const { data: embeddedEntities, count: embeddingCount } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, taxonomy, brief_description, embedding', { count: 'exact' })
        .not('embedding', 'is', null)
        .limit(5);

    console.log(`\n📊 Embeddings Status:`);
    console.log(`  - Total with embeddings: ${embeddingCount}/29078`);
    console.log(`  - Dimension: ${embeddedEntities[0]?.embedding?.length || 0}`);

    console.log(`\n🔬 Sample Embedded Entities:`);
    embeddedEntities.forEach((entity, i) => {
        console.log(`\n  ${i + 1}. ${entity.name} (${entity.type})`);
        console.log(`     - Taxonomy: ${entity.taxonomy || 'N/A'}`);
        console.log(`     - Description: ${(entity.brief_description || 'N/A').substring(0, 80)}...`);
    });

    // Check taxonomy distribution
    const { data: taxonomies } = await supabase
        .schema('graph')
        .from('entities')
        .select('taxonomy')
        .not('taxonomy', 'is', null)
        .limit(1000);

    const taxCounts = {};
    taxonomies.forEach(e => {
        taxCounts[e.taxonomy] = (taxCounts[e.taxonomy] || 0) + 1;
    });

    console.log(`\n📋 Taxonomy Distribution (sample of 1000):`);
    Object.entries(taxCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([tax, count]) => {
            console.log(`  - ${tax}: ${count}`);
        });
}

checkData().catch(console.error);
