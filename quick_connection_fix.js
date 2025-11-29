require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Quick Connection Fix - Immediate portfolio company connections
 * 
 * This script quickly creates the most important missing connections
 * to improve the connection query functionality.
 */

async function quickConnectionFix() {
  console.log('🚀 Quick Connection Fix - Creating Critical Missing Connections...\n');
  
  let connectionsCreated = 0;
  let errors = 0;

  try {
    // 1. Find Motive Partners
    console.log('1️⃣ Finding Motive Partners...');
    const { data: motivePartners } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('name', 'Motive Partners')
      .eq('type', 'organization')
      .single();

    if (!motivePartners) {
      console.log('   ❌ Motive Partners not found');
      return;
    }
    console.log(`   ✅ Found: ${motivePartners.name} (ID: ${motivePartners.id})`);

    // 2. Connect portfolio companies to Motive Partners
    console.log('\n2️⃣ Connecting portfolio companies to Motive Partners...');
    const { data: portfolioCompanies } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, fund')
      .eq('is_portfolio', true)
      .not('fund', 'is', null)
      .limit(20);

    console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies`);

    for (const company of portfolioCompanies || []) {
      try {
        // Check if connection already exists
        const { data: existingEdge } = await supabase
          .schema('graph')
          .from('edges')
          .select('id')
          .or(`source.eq.${company.id},target.eq.${company.id}`)
          .or(`source.eq.${motivePartners.id},target.eq.${motivePartners.id}`);

        const hasConnection = existingEdge?.some(edge => 
          (edge.source === company.id && edge.target === motivePartners.id) ||
          (edge.source === motivePartners.id && edge.target === company.id)
        );

        if (!hasConnection) {
          const { error } = await supabase
            .schema('graph')
            .from('edges')
            .insert({
              source: company.id,
              target: motivePartners.id,
              kind: 'colleague', // Use allowed kind
              strength_score: 0.9,
              interaction_count: 1,
              last_interaction_date: new Date().toISOString()
            });

          if (error) {
            console.log(`   ❌ Error connecting ${company.name}: ${error.message}`);
            errors++;
          } else {
            console.log(`   ✅ Connected ${company.name} → Motive Partners`);
            connectionsCreated++;
          }
        } else {
          console.log(`   ⏭️  ${company.name} already connected`);
        }
      } catch (error) {
        console.log(`   ❌ Error with ${company.name}: ${error.message}`);
        errors++;
      }
    }

    // 3. Connect LinkedIn first-degree connections to Harsh
    console.log('\n3️⃣ Connecting LinkedIn first-degree connections to Harsh...');
    const { data: harsh } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('name', 'Harsh Govil')
      .eq('type', 'person')
      .single();

    if (harsh) {
      const { data: linkedinConnections } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('enrichment_data->linkedin_first_degree', true)
        .eq('type', 'person')
        .limit(10);

      console.log(`   Found ${linkedinConnections?.length || 0} LinkedIn first-degree connections`);

      for (const person of linkedinConnections || []) {
        try {
          // Check if already connected to Harsh
          const { data: existingEdge } = await supabase
            .schema('graph')
            .from('edges')
            .select('id')
            .or(`source.eq.${person.id},target.eq.${harsh.id}`)
            .or(`source.eq.${harsh.id},target.eq.${person.id}`);

          const hasConnection = existingEdge?.some(edge => 
            (edge.source === person.id && edge.target === harsh.id) ||
            (edge.source === harsh.id && edge.target === person.id)
          );

          if (!hasConnection) {
            const { error } = await supabase
              .schema('graph')
              .from('edges')
              .insert({
                source: harsh.id,
                target: person.id,
                kind: 'colleague',
                strength_score: 0.8,
                interaction_count: 1,
                last_interaction_date: new Date().toISOString()
              });

            if (error) {
              console.log(`   ❌ Error connecting ${person.name}: ${error.message}`);
              errors++;
            } else {
              console.log(`   ✅ Connected Harsh → ${person.name} (LinkedIn)`);
              connectionsCreated++;
            }
          } else {
            console.log(`   ⏭️  ${person.name} already connected to Harsh`);
          }
        } catch (error) {
          console.log(`   ❌ Error with ${person.name}: ${error.message}`);
          errors++;
        }
      }
    }

    // 4. Test the connection query
    console.log('\n4️⃣ Testing connection query...');
    try {
      const response = await fetch('http://localhost:3000/api/graph/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'who can connect me to niklas radner', limit: 5 })
      });
      
      const data = await response.json();
      console.log(`   Query result: ${data.results?.length || 0} connections found`);
      
      if (data.results?.length > 0) {
        data.results.forEach((result, i) => {
          console.log(`     ${i+1}. ${result.name} - ${result.metadata?.path_description}`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Query test failed: ${error.message}`);
    }

    // 5. Print summary
    console.log('\n📊 Quick Fix Summary:');
    console.log(`   ✅ Connections Created: ${connectionsCreated}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📈 Success Rate: ${connectionsCreated + errors > 0 ? 
      ((connectionsCreated / (connectionsCreated + errors)) * 100).toFixed(1) : 0}%`);

  } catch (error) {
    console.error('❌ Quick fix failed:', error);
  }
}

// Run the quick fix
quickConnectionFix().catch(console.error);
