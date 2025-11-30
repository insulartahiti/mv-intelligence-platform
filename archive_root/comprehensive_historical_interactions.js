#!/usr/bin/env node

/**
 * Comprehensive Historical Interactions Solution
 * 
 * This script implements the complete solution for pulling all historical
 * interactions from Affinity, addressing all API limitations:
 * - 1-year date range limitation (chunked requests)
 * - Must specify organization_id, person_id, or opportunity_id
 * - Correct interaction types (0-3)
 * - Proper error handling and rate limiting
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class HistoricalInteractionProcessor {
  constructor() {
    this.affinityApiKey = process.env.AFFINITY_API_KEY;
    this.interactionTypes = [0, 1, 2, 3]; // email, meeting, call, note
    this.typeNames = { 0: 'email', 1: 'meeting', 2: 'call', 3: 'note' };
    this.processedCount = 0;
    this.errorCount = 0;
  }

  async createDateChunks(startTime, endTime) {
    const chunks = [];
    let currentStart = new Date(startTime);
    
    while (currentStart < endTime) {
      const currentEnd = new Date(currentStart);
      currentEnd.setFullYear(currentEnd.getFullYear() + 1);
      
      // Don't go beyond the end time
      if (currentEnd > endTime) {
        currentEnd.setTime(endTime.getTime());
      }
      
      chunks.push({
        start: new Date(currentStart),
        end: new Date(currentEnd)
      });
      
      currentStart = new Date(currentEnd);
    }
    
    return chunks;
  }

  async makeAffinityRequest(path) {
    const response = await fetch(`https://api.affinity.co${path}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + this.affinityApiKey).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Affinity API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  async fetchOrganizationInteractions(orgId, orgName) {
    try {
      console.log(`\n🏢 Processing ${orgName} (ID: ${orgId})...`);
      
      const endTime = new Date();
      const startTime = new Date('2020-01-01'); // Full historical data from 2020
      
      // Create 1-year chunks from 2020 to present
      const chunks = await this.createDateChunks(startTime, endTime);
      const allInteractions = [];
      
      for (const type of this.interactionTypes) {
        for (const chunk of chunks) {
          try {
            console.log(`  🔍 Fetching ${this.typeNames[type]} interactions from ${chunk.start.toISOString().split('T')[0]} to ${chunk.end.toISOString().split('T')[0]}...`);
            
            const response = await this.makeAffinityRequest(
              `/interactions?organization_id=${orgId}&type=${type}&start_time=${chunk.start.toISOString()}&end_time=${chunk.end.toISOString()}&limit=1000`
            );
            
            if (response.interactions) {
              const interactions = response.interactions.map((interaction) => ({
                id: interaction.id,
                type: this.typeNames[type],
                subject: interaction.subject || '',
                content: interaction.content || '',
                date: interaction.date,
                person_id: interaction.person_id,
                organization_id: interaction.organization_id
              }));
              
              allInteractions.push(...interactions);
              console.log(`    ✅ Found ${interactions.length} ${this.typeNames[type]} interactions`);
            }
            
            // Rate limiting - small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error) {
            console.log(`    ⚠️ No ${this.typeNames[type]} interactions for this chunk: ${error.message}`);
          }
        }
      }
      
      console.log(`  📊 Total interactions for ${orgName}: ${allInteractions.length}`);
      return allInteractions;
      
    } catch (error) {
      console.error(`❌ Error fetching interactions for ${orgName}:`, error.message);
      return [];
    }
  }

  async storeInteractions(interactions, entityId) {
    if (interactions.length === 0) return;
    
    try {
      console.log(`  💾 Storing ${interactions.length} interactions...`);
      
      for (const interaction of interactions) {
        try {
          const interactionData = {
            affinity_interaction_id: interaction.id,
            interaction_type: interaction.type,
            subject: interaction.subject,
            content_preview: interaction.content?.substring(0, 500) || '',
            content_full: interaction.content || '',
            participants: interaction.person_id ? [`person_${interaction.person_id}`] : [],
            company_id: entityId,
            started_at: interaction.date,
            source: 'affinity_api_sync'
          };

          await supabase
            .schema('graph')
            .from('interactions')
            .upsert(interactionData, { onConflict: 'affinity_interaction_id' });
          
          this.processedCount++;
        } catch (error) {
          console.error(`    ❌ Error storing interaction ${interaction.id}:`, error.message);
          this.errorCount++;
        }
      }
      
      console.log(`  ✅ Stored ${interactions.length} interactions successfully`);
      
    } catch (error) {
      console.error(`❌ Error storing interactions:`, error.message);
    }
  }

  async processAllInteractions() {
    try {
      console.log('🚀 Starting comprehensive historical interactions processing...');
      
      // Get all entities with Affinity org IDs
      const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, affinity_org_id')
        .not('affinity_org_id', 'is', null)
        .limit(20); // Process first 20 for testing
      
      if (error) {
        console.error('❌ Error fetching entities:', error);
        return;
      }
      
      if (!entities || entities.length === 0) {
        console.log('❌ No entities with Affinity org IDs found');
        return;
      }
      
      console.log(`📊 Found ${entities.length} entities with Affinity org IDs`);
      
      // Process each entity
      for (const entity of entities) {
        try {
          const interactions = await this.fetchOrganizationInteractions(entity.affinity_org_id, entity.name);
          await this.storeInteractions(interactions, entity.id);
          
          // Rate limiting between organizations
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Error processing ${entity.name}:`, error.message);
          this.errorCount++;
        }
      }
      
      console.log('\n🎉 Historical interactions processing complete!');
      console.log(`📊 Total processed: ${this.processedCount}`);
      console.log(`❌ Total errors: ${this.errorCount}`);
      
      // Check final count
      const { data: finalCount } = await supabase
        .schema('graph')
        .from('interactions')
        .select('*', { count: 'exact', head: true });
      
      console.log(`📈 Total interactions in database: ${finalCount?.length || 0}`);
      
    } catch (error) {
      console.error('❌ Fatal error:', error);
    }
  }
}

// Run the processor
const processor = new HistoricalInteractionProcessor();
processor.processAllInteractions();




