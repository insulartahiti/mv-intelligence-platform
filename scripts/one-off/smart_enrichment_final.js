require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Smart Enrichment System - Final Working Version
 * 
 * This system intelligently discovers and creates missing connections
 * using only allowed relationship types and proper error handling.
 */

class SmartEnrichmentSystem {
  constructor() {
    this.stats = {
      connectionsCreated: 0,
      connectionsSkipped: 0,
      errors: 0,
      startTime: new Date()
    };
    
    // Only use allowed relationship types
    this.allowedKinds = ['colleague', 'deal_team', 'owner'];
    this.relationshipMapping = {
      'founder': 'colleague',
      'ceo': 'colleague', 
      'cto': 'colleague',
      'cfo': 'colleague',
      'director': 'colleague',
      'manager': 'colleague',
      'employee': 'colleague',
      'portfolio': 'owner',
      'deal_team': 'deal_team'
    };
  }

  /**
   * Run smart enrichment with proper error handling
   */
  async runSmartEnrichment() {
    console.log('🧠 Starting Smart Enrichment System...\n');
    
    try {
      // Phase 1: Portfolio company connections
      await this.enrichPortfolioConnections();
      
      // Phase 2: Founder/CEO relationships
      await this.enrichFounderConnections();
      
      // Phase 3: LinkedIn connections
      await this.enrichLinkedInConnections();
      
      // Phase 4: Deal team connections
      await this.enrichDealTeamConnections();
      
      // Phase 5: Employee relationships
      await this.enrichEmployeeConnections();
      
      // Phase 6: Validation and summary
      await this.validateAndSummarize();
      
      this.printSmartSummary();
      
    } catch (error) {
      console.error('❌ Smart enrichment failed:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 1: Portfolio company connections
   */
  async enrichPortfolioConnections() {
    console.log('📊 Phase 1: Portfolio Company Connections...');
    
    try {
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

      const { data: portfolioCompanies } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, is_portfolio')
        .eq('is_portfolio', true)
        .limit(50);

      console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies`);

      for (const company of portfolioCompanies || []) {
        const hasConnection = await this.checkConnectionExists(company.id, motivePartners.id);
        
        if (!hasConnection) {
          try {
            await this.createConnection({
              source: company.id,
              target: motivePartners.id,
              kind: 'owner',
              strength_score: 0.9,
              description: `${company.name} → Motive Partners (portfolio)`
            });
          } catch (error) {
            console.log(`   ❌ ${company.name}: ${error.message}`);
            this.stats.errors++;
          }
        } else {
          console.log(`   ⏭️  ${company.name} already connected`);
          this.stats.connectionsSkipped++;
        }
      }

    } catch (error) {
      console.error('   ❌ Portfolio enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 2: Founder/CEO relationships
   */
  async enrichFounderConnections() {
    console.log('\n👔 Phase 2: Founder/CEO Relationships...');
    
    try {
      const { data: people } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('type', 'person')
        .not('enrichment_data', 'is', null)
        .limit(100);

      console.log(`   Checking ${people?.length || 0} people for founder relationships`);

      for (const person of people || []) {
        const enrichment = person.enrichment_data || {};
        
        if (enrichment.current_company && enrichment.current_position) {
          const { data: companies } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name')
            .ilike('name', `%${enrichment.current_company}%`)
            .eq('type', 'organization')
            .limit(1);

          if (companies?.[0]) {
            const hasConnection = await this.checkConnectionExists(person.id, companies[0].id);
            
            if (!hasConnection) {
              const relationshipType = this.mapRelationshipType(enrichment.current_position);
              
              try {
                await this.createConnection({
                  source: person.id,
                  target: companies[0].id,
                  kind: relationshipType,
                  strength_score: this.calculateStrength(enrichment.current_position),
                  description: `${person.name} → ${companies[0].name} (${enrichment.current_position})`
                });
              } catch (error) {
                console.log(`   ❌ ${person.name}: ${error.message}`);
                this.stats.errors++;
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Founder enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 3: LinkedIn connections
   */
  async enrichLinkedInConnections() {
    console.log('\n🔗 Phase 3: LinkedIn First-Degree Connections...');
    
    try {
      const { data: harsh } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .eq('name', 'Harsh Govil')
        .eq('type', 'person')
        .single();

      if (!harsh) {
        console.log('   ❌ Harsh Govil not found');
        return;
      }

      const { data: linkedinConnections } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .eq('enrichment_data->linkedin_first_degree', true)
        .eq('type', 'person')
        .limit(20);

      console.log(`   Found ${linkedinConnections?.length || 0} LinkedIn first-degree connections`);

      for (const person of linkedinConnections || []) {
        const hasConnection = await this.checkConnectionExists(harsh.id, person.id);
        
        if (!hasConnection) {
          try {
            await this.createConnection({
              source: harsh.id,
              target: person.id,
              kind: 'colleague',
              strength_score: 0.8,
              description: `Harsh → ${person.name} (LinkedIn)`
            });
          } catch (error) {
            console.log(`   ❌ ${person.name}: ${error.message}`);
            this.stats.errors++;
          }
        } else {
          console.log(`   ⏭️  ${person.name} already connected`);
          this.stats.connectionsSkipped++;
        }
      }

    } catch (error) {
      console.error('   ❌ LinkedIn enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 4: Deal team connections
   */
  async enrichDealTeamConnections() {
    console.log('\n🤝 Phase 4: Deal Team Connections...');
    
    try {
      const { data: dealTeamEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, target, kind')
        .eq('kind', 'deal_team')
        .limit(20);

      console.log(`   Found ${dealTeamEdges?.length || 0} deal team edges`);

      // Group by deal (same source = same deal)
      const dealGroups = {};
      for (const edge of dealTeamEdges || []) {
        if (!dealGroups[edge.source]) {
          dealGroups[edge.source] = [];
        }
        dealGroups[edge.source].push(edge.target);
      }

      // Create connections between team members
      for (const [dealId, teamMembers] of Object.entries(dealGroups)) {
        for (let i = 0; i < teamMembers.length; i++) {
          for (let j = i + 1; j < teamMembers.length; j++) {
            const member1 = teamMembers[i];
            const member2 = teamMembers[j];

            const hasConnection = await this.checkConnectionExists(member1, member2);
            
            if (!hasConnection) {
              try {
                await this.createConnection({
                  source: member1,
                  target: member2,
                  kind: 'colleague',
                  strength_score: 0.7,
                  description: `Deal team members (${dealId})`
                });
              } catch (error) {
                console.log(`   ❌ Deal team connection: ${error.message}`);
                this.stats.errors++;
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Deal team enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 5: Employee relationships
   */
  async enrichEmployeeConnections() {
    console.log('\n👥 Phase 5: Employee-Company Relationships...');
    
    try {
      const { data: people } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('type', 'person')
        .not('enrichment_data', 'is', null)
        .limit(200);

      console.log(`   Checking ${people?.length || 0} people for employment relationships`);

      for (const person of people || []) {
        const enrichment = person.enrichment_data || {};
        
        if (enrichment.current_company) {
          const { data: companies } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name')
            .ilike('name', `%${enrichment.current_company}%`)
            .eq('type', 'organization')
            .limit(1);

          if (companies?.[0]) {
            const hasConnection = await this.checkConnectionExists(person.id, companies[0].id);
            
            if (!hasConnection) {
              try {
                await this.createConnection({
                  source: person.id,
                  target: companies[0].id,
                  kind: 'colleague',
                  strength_score: 0.6,
                  description: `${person.name} → ${companies[0].name} (employee)`
                });
              } catch (error) {
                console.log(`   ❌ ${person.name}: ${error.message}`);
                this.stats.errors++;
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Employee enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Phase 6: Validation and summary
   */
  async validateAndSummarize() {
    console.log('\n🔧 Phase 6: Validation and Summary...');
    
    try {
      // Get final statistics
      const { count: totalEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

      const { count: totalEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });

      const finalDensity = totalEntities ? (totalEdges / totalEntities) : 0;
      
      console.log(`   Final graph statistics:`);
      console.log(`   - Entities: ${totalEntities}`);
      console.log(`   - Edges: ${totalEdges}`);
      console.log(`   - Density: ${finalDensity.toFixed(2)} connections per entity`);

      // Check connection types
      const { data: edgeTypes } = await supabase
        .schema('graph')
        .from('edges')
        .select('kind')
        .not('kind', 'is', null)
        .limit(1000);

      const typeCounts = {};
      for (const edge of edgeTypes || []) {
        typeCounts[edge.kind] = (typeCounts[edge.kind] || 0) + 1;
      }

      console.log(`   Connection types:`);
      for (const [type, count] of Object.entries(typeCounts)) {
        console.log(`   - ${type}: ${count}`);
      }

    } catch (error) {
      console.error('   ❌ Validation error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Helper methods
   */
  async checkConnectionExists(sourceId, targetId) {
    const { data: edge } = await supabase
      .schema('graph')
      .from('edges')
      .select('id')
      .or(`source.eq.${sourceId},target.eq.${sourceId}`)
      .or(`source.eq.${targetId},target.eq.${targetId}`);

    return edge?.some(e => 
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
    );
  }

  async createConnection(connection) {
    const { error } = await supabase
      .schema('graph')
      .from('edges')
      .insert({
        source: connection.source,
        target: connection.target,
        kind: connection.kind,
        strength_score: connection.strength_score,
        interaction_count: 1,
        last_interaction_date: new Date().toISOString()
      });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ ${connection.description}`);
    this.stats.connectionsCreated++;
  }

  mapRelationshipType(position) {
    const pos = position.toLowerCase();
    if (pos.includes('founder') || pos.includes('ceo')) return 'colleague';
    if (pos.includes('cto') || pos.includes('cfo')) return 'colleague';
    if (pos.includes('director') || pos.includes('manager')) return 'colleague';
    return 'colleague';
  }

  calculateStrength(position) {
    const pos = position.toLowerCase();
    if (pos.includes('founder') || pos.includes('ceo')) return 0.9;
    if (pos.includes('cto') || pos.includes('cfo')) return 0.8;
    if (pos.includes('director')) return 0.7;
    if (pos.includes('manager')) return 0.6;
    return 0.5;
  }

  printSmartSummary() {
    const duration = new Date() - this.stats.startTime;
    
    console.log('\n🧠 Smart Enrichment Summary');
    console.log('='.repeat(50));
    
    console.log('\n📊 Results:');
    console.log(`   ✅ Connections Created: ${this.stats.connectionsCreated}`);
    console.log(`   ⏭️  Connections Skipped: ${this.stats.connectionsSkipped}`);
    console.log(`   ❌ Errors: ${this.stats.errors}`);
    console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
    
    const successRate = this.stats.connectionsCreated + this.stats.connectionsSkipped > 0 ? 
      ((this.stats.connectionsCreated / (this.stats.connectionsCreated + this.stats.connectionsSkipped)) * 100).toFixed(1) : 0;
    
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Test connection queries with new connections');
    console.log('   2. Monitor graph performance and density');
    console.log('   3. Set up automated monitoring for new data');
    console.log('   4. Optimize path-finding algorithms');
  }
}

// Run the smart enrichment system
async function main() {
  const enrichmentSystem = new SmartEnrichmentSystem();
  await enrichmentSystem.runSmartEnrichment();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { SmartEnrichmentSystem };




