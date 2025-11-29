#!/usr/bin/env node

/**
 * Comprehensive Historical Interactions Test
 * 
 * This script tests the complete flow of pulling historical interactions
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testComprehensive() {
  try {
    console.log('🔍 Comprehensive Historical Interactions Test');
    
    // Step 1: Check if we have entities with Affinity org IDs
    console.log('\n📊 Step 1: Checking entities with Affinity org IDs...');
    const { data: entities, error: entityError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, affinity_org_id')
      .not('affinity_org_id', 'is', null)
      .limit(5);
    
    if (entityError) {
      console.log('❌ Error querying entities:', entityError);
      return;
    }
    
    if (!entities || entities.length === 0) {
      console.log('❌ No entities with Affinity org IDs found');
      console.log('🔍 Checking all entities...');
      
      const { data: allEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, affinity_org_id, source')
        .limit(5);
      
      console.log('All entities sample:', allEntities);
      return;
    }
    
    console.log(`✅ Found ${entities.length} entities with Affinity org IDs`);
    console.log('Sample entity:', entities[0]);
    
    // Step 2: Test direct Affinity API call
    console.log('\n🔍 Step 2: Testing direct Affinity API call...');
    const affinityApiKey = process.env.AFFINITY_API_KEY;
    const testOrg = entities[0];
    
    // Test with 1-year chunk
    const endTime = new Date();
    const startTime = new Date();
    startTime.setFullYear(endTime.getFullYear() - 1);
    
    const response = await fetch(
      `https://api.affinity.co/interactions?organization_id=${testOrg.affinity_org_id}&type=0&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&limit=10`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(':' + affinityApiKey).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Direct API call successful: ${data.interactions?.length || 0} interactions found`);
      if (data.interactions && data.interactions.length > 0) {
        console.log('Sample interaction:', {
          id: data.interactions[0].id,
          subject: data.interactions[0].subject,
          date: data.interactions[0].date
        });
      }
    } else {
      console.log('❌ Direct API call failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText);
    }
    
    // Step 3: Test Edge Function with specific entity
    console.log('\n🔍 Step 3: Testing Edge Function with specific entity...');
    const { data: funcResult, error: funcError } = await supabase.functions.invoke('process-interactions', {
      body: {
        action: 'entity',
        entityId: testOrg.id,
        affinityOrgId: testOrg.affinity_org_id
      }
    });
    
    if (funcError) {
      console.log('❌ Edge Function error:', funcError);
    } else {
      console.log('✅ Edge Function result:', funcResult);
    }
    
    // Step 4: Check database for interactions
    console.log('\n🔍 Step 4: Checking database for interactions...');
    const { data: interactions, error: interactionError } = await supabase
      .schema('graph')
      .from('interactions')
      .select('*', { count: 'exact', head: true });
    
    if (interactionError) {
      console.log('❌ Error checking interactions:', interactionError);
    } else {
      console.log(`📊 Total interactions in database: ${interactions?.length || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testComprehensive();




