#!/usr/bin/env node

/**
 * Test Affinity Interactions API
 * 
 * This script directly tests the Affinity API to see if we can fetch interactions
 */

require('dotenv').config();

async function testAffinityInteractions() {
  try {
    console.log('🔍 Testing Affinity API directly...');
    
    const affinityApiKey = process.env.AFFINITY_API_KEY;
    const affinityOrgId = process.env.AFFINITY_ORG_ID || '7624528';
    
    if (!affinityApiKey) {
      console.log('❌ AFFINITY_API_KEY not found in environment');
      return;
    }
    
    console.log('🔑 Using Affinity Org ID:', affinityOrgId);
    
    // Test fetching organizations first
    const orgResponse = await fetch('https://api.affinity.co/organizations?limit=5', {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + affinityApiKey).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!orgResponse.ok) {
      console.log('❌ Organizations API failed:', orgResponse.status, orgResponse.statusText);
      const errorText = await orgResponse.text();
      console.log('Error details:', errorText);
      return;
    }
    
    const orgData = await orgResponse.json();
    console.log('✅ Organizations API working, found', orgData.organizations?.length || 0, 'organizations');
    
    if (orgData.organizations && orgData.organizations.length > 0) {
      const org = orgData.organizations[0];
      console.log('🏢 Testing with organization:', org.name, 'ID:', org.id);
      
      // Test fetching interactions for this organization
      const endTime = new Date();
      const startTime = new Date('2020-01-01');
      
      const interactionTypes = [1, 2, 3, 4]; // email, meeting, call, note
      let totalInteractions = 0;
      
      for (const type of interactionTypes) {
        try {
          const typeNames = { 1: 'email', 2: 'meeting', 3: 'call', 4: 'note' };
          console.log(`🔍 Testing ${typeNames[type]} interactions...`);
          
          const interactionResponse = await fetch(
            `https://api.affinity.co/interactions?organization_id=${org.id}&type=${type}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&limit=10`,
            {
              headers: {
                'Authorization': `Basic ${Buffer.from(':' + affinityApiKey).toString('base64')}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (interactionResponse.ok) {
            const interactionData = await interactionResponse.json();
            const count = interactionData.interactions?.length || 0;
            console.log(`✅ ${typeNames[type]} interactions:`, count);
            totalInteractions += count;
            
            if (count > 0) {
              console.log('Sample interaction:', {
                id: interactionData.interactions[0].id,
                subject: interactionData.interactions[0].subject,
                date: interactionData.interactions[0].date
              });
            }
          } else {
            console.log(`❌ ${typeNames[type]} failed:`, interactionResponse.status, interactionResponse.statusText);
            const errorText = await interactionResponse.text();
            console.log('Error details:', errorText);
          }
        } catch (error) {
          console.log(`❌ ${typeNames[type]} error:`, error.message);
        }
      }
      
      console.log('📊 Total interactions found:', totalInteractions);
      
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testAffinityInteractions();
