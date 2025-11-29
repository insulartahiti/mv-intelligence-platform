import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Comprehensive Connection Enrichment System
 * 
 * This system automatically discovers and creates missing connections in the knowledge graph
 * based on various data sources and relationship patterns.
 */

class ConnectionEnrichmentSystem {
  constructor() {
    this.stats = {
      connectionsCreated: 0,
      connectionsSkipped: 0,
      errors: 0,
      startTime: new Date()
    };
  }

  /**
   * Main entry point - runs all connection enrichment processes
   */
  async runFullEnrichment() {
    console.log('🚀 Starting Comprehensive Connection Enrichment...\n');
    
    try {
      // 1. Portfolio Company Connections
      await this.enrichPortfolioConnections();
      
      // 2. Founder/CEO Relationships
      await this.enrichFounderConnections();
      
      // 3. LinkedIn First-Degree Connections
      await this.enrichLinkedInConnections();
      
      // 4. Deal Team Relationships
      await this.enrichDealTeamConnections();
      
      // 5. Affinity Interaction Connections
      await this.enrichAffinityConnections();
      
      // 6. Company-Employee Relationships
      await this.enrichEmployeeConnections();
      
      // 7. Cleanup and Validation
      await this.validateAndCleanup();
      
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Enrichment failed:', error);
      this.stats.errors++;
    }
  }

  /**
   * 1. Connect portfolio companies to Motive Partners
   */
  async enrichPortfolioConnections() {
    console.log('📊 1. Enriching Portfolio Company Connections...');
    
    try {
      // Find Motive Partners
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

      // Find portfolio companies
      const { data: portfolioCompanies } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, fund')
        .eq('is_portfolio', true)
        .not('fund', 'is', null);

      console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies`);

      for (const company of portfolioCompanies || []) {
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
          await this.createEdge({
            source: company.id,
            target: motivePartners.id,
            kind: 'portfolio',
            strength_score: 0.9,
            interaction_count: 1,
            last_interaction_date: new Date().toISOString()
          });
          
          console.log(`   ✅ Connected ${company.name} → Motive Partners`);
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
   * 2. Create founder/CEO relationships from enrichment data
   */
  async enrichFounderConnections() {
    console.log('\n👔 2. Enriching Founder/CEO Connections...');
    
    try {
      const { data: entities } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, enrichment_data')
        .not('enrichment_data', 'is', null)
        .eq('type', 'person')
        .limit(100);

      console.log(`   Checking ${entities?.length || 0} people for founder relationships`);

      for (const person of entities || []) {
        const enrichment = person.enrichment_data || {};
        
        if (enrichment.current_company && enrichment.current_position) {
          // Find the company
          const { data: companies } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name')
            .ilike('name', `%${enrichment.current_company}%`)
            .eq('type', 'organization')
            .limit(1);

          if (companies?.[0]) {
            const company = companies[0];
            
            // Check if connection exists
            const { data: existingEdge } = await supabase
              .schema('graph')
              .from('edges')
              .select('id')
              .or(`source.eq.${person.id},target.eq.${person.id}`)
              .or(`source.eq.${company.id},target.eq.${company.id}`);

            const hasConnection = existingEdge?.some(edge => 
              (edge.source === person.id && edge.target === company.id) ||
              (edge.source === company.id && edge.target === person.id)
            );

            if (!hasConnection) {
              const relationshipType = this.determineRelationshipType(enrichment.current_position);
              
              await this.createEdge({
                source: person.id,
                target: company.id,
                kind: relationshipType,
                strength_score: this.calculateRelationshipStrength(enrichment.current_position),
                interaction_count: 1,
                last_interaction_date: new Date().toISOString()
              });
              
              console.log(`   ✅ Connected ${person.name} → ${company.name} (${relationshipType})`);
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
   * 3. Create LinkedIn first-degree connections
   */
  async enrichLinkedInConnections() {
    console.log('\n🔗 3. Enriching LinkedIn First-Degree Connections...');
    
    try {
      // Find Harsh Govil
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

      // Find LinkedIn first-degree connections
      const { data: linkedinConnections } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('enrichment_data->linkedin_first_degree', true)
        .eq('type', 'person');

      console.log(`   Found ${linkedinConnections?.length || 0} LinkedIn first-degree connections`);

      for (const person of linkedinConnections || []) {
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
          await this.createEdge({
            source: harsh.id,
            target: person.id,
            kind: 'colleague',
            strength_score: 0.8,
            interaction_count: 1,
            last_interaction_date: new Date().toISOString()
          });
          
          console.log(`   ✅ Connected Harsh → ${person.name} (LinkedIn)`);
        }
      }

    } catch (error) {
      console.error('   ❌ LinkedIn enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * 4. Enrich deal team relationships
   */
  async enrichDealTeamConnections() {
    console.log('\n🤝 4. Enriching Deal Team Connections...');
    
    try {
      // Find entities involved in deal teams
      const { data: dealTeamEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, target, kind')
        .eq('kind', 'deal_team');

      console.log(`   Found ${dealTeamEdges?.length || 0} deal team edges`);

      // Group by deal (assuming same source means same deal)
      const dealGroups = {};
      for (const edge of dealTeamEdges || []) {
        if (!dealGroups[edge.source]) {
          dealGroups[edge.source] = [];
        }
        dealGroups[edge.source].push(edge.target);
      }

      // Create connections between all team members
      for (const [dealId, teamMembers] of Object.entries(dealGroups)) {
        for (let i = 0; i < teamMembers.length; i++) {
          for (let j = i + 1; j < teamMembers.length; j++) {
            const member1 = teamMembers[i];
            const member2 = teamMembers[j];

            // Check if connection exists
            const { data: existingEdge } = await supabase
              .schema('graph')
              .from('edges')
              .select('id')
              .or(`source.eq.${member1},target.eq.${member1}`)
              .or(`source.eq.${member2},target.eq.${member2}`);

            const hasConnection = existingEdge?.some(edge => 
              (edge.source === member1 && edge.target === member2) ||
              (edge.source === member2 && edge.target === member1)
            );

            if (!hasConnection) {
              await this.createEdge({
                source: member1,
                target: member2,
                kind: 'colleague',
                strength_score: 0.7,
                interaction_count: 1,
                last_interaction_date: new Date().toISOString()
              });
              
              console.log(`   ✅ Connected team members (deal team)`);
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
   * 5. Create connections based on Affinity interactions
   */
  async enrichAffinityConnections() {
    console.log('\n📧 5. Enriching Affinity Interaction Connections...');
    
    try {
      const { data: interactions } = await supabase
        .schema('graph')
        .from('interactions')
        .select('participants, company_id')
        .not('participants', 'is', null)
        .limit(100);

      console.log(`   Found ${interactions?.length || 0} interactions`);

      for (const interaction of interactions || []) {
        const participants = interaction.participants || [];
        
        // Create connections between all participants
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            const participant1 = participants[i];
            const participant2 = participants[j];

            // Check if connection exists
            const { data: existingEdge } = await supabase
              .schema('graph')
              .from('edges')
              .select('id')
              .or(`source.eq.${participant1},target.eq.${participant1}`)
              .or(`source.eq.${participant2},target.eq.${participant2}`);

            const hasConnection = existingEdge?.some(edge => 
              (edge.source === participant1 && edge.target === participant2) ||
              (edge.source === participant2 && edge.target === participant1)
            );

            if (!hasConnection) {
              await this.createEdge({
                source: participant1,
                target: participant2,
                kind: 'colleague',
                strength_score: 0.6,
                interaction_count: 1,
                last_interaction_date: new Date().toISOString()
              });
              
              console.log(`   ✅ Connected interaction participants`);
            }
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Affinity enrichment error:', error);
      this.stats.errors++;
    }
  }

  /**
   * 6. Create employee-company relationships
   */
  async enrichEmployeeConnections() {
    console.log('\n👥 6. Enriching Employee-Company Connections...');
    
    try {
      // Find people with company information in enrichment data
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
          // Find the company
          const { data: companies } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name')
            .ilike('name', `%${enrichment.current_company}%`)
            .eq('type', 'organization')
            .limit(1);

          if (companies?.[0]) {
            const company = companies[0];
            
            // Check if connection exists
            const { data: existingEdge } = await supabase
              .schema('graph')
              .from('edges')
              .select('id')
              .or(`source.eq.${person.id},target.eq.${person.id}`)
              .or(`source.eq.${company.id},target.eq.${company.id}`);

            const hasConnection = existingEdge?.some(edge => 
              (edge.source === person.id && edge.target === company.id) ||
              (edge.source === company.id && edge.target === person.id)
            );

            if (!hasConnection) {
              await this.createEdge({
                source: person.id,
                target: company.id,
                kind: 'employee',
                strength_score: 0.8,
                interaction_count: 1,
                last_interaction_date: new Date().toISOString()
              });
              
              console.log(`   ✅ Connected ${person.name} → ${company.name} (employee)`);
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
   * 7. Validate and cleanup connections
   */
  async validateAndCleanup() {
    console.log('\n🧹 7. Validating and Cleaning Up...');
    
    try {
      // Check for duplicate edges
      const { data: duplicates } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, target, count')
        .group('source, target')
        .having('count', 'gt', 1);

      if (duplicates?.length > 0) {
        console.log(`   Found ${duplicates.length} potential duplicate edges`);
      }

      // Get final statistics
      const { count: totalEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

      const { count: totalEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });

      console.log(`   Final graph: ${totalEntities} entities, ${totalEdges} edges`);
      console.log(`   Average connections per entity: ${totalEntities ? (totalEdges / totalEntities).toFixed(2) : 0}`);

    } catch (error) {
      console.error('   ❌ Validation error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Helper method to create an edge
   */
  async createEdge(edgeData) {
    try {
      const { error } = await supabase
        .schema('graph')
        .from('edges')
        .insert(edgeData);

      if (error) {
        console.error(`   ❌ Error creating edge:`, error.message);
        this.stats.errors++;
      } else {
        this.stats.connectionsCreated++;
      }
    } catch (error) {
      console.error(`   ❌ Edge creation error:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Determine relationship type based on position
   */
  determineRelationshipType(position) {
    const pos = position.toLowerCase();
    
    if (pos.includes('founder') || pos.includes('co-founder')) return 'founder';
    if (pos.includes('ceo') || pos.includes('chief executive')) return 'ceo';
    if (pos.includes('cto') || pos.includes('chief technology')) return 'cto';
    if (pos.includes('cfo') || pos.includes('chief financial')) return 'cfo';
    if (pos.includes('director') || pos.includes('head')) return 'director';
    if (pos.includes('manager') || pos.includes('lead')) return 'manager';
    
    return 'employee';
  }

  /**
   * Calculate relationship strength based on position
   */
  calculateRelationshipStrength(position) {
    const pos = position.toLowerCase();
    
    if (pos.includes('founder') || pos.includes('ceo')) return 0.9;
    if (pos.includes('cto') || pos.includes('cfo')) return 0.8;
    if (pos.includes('director') || pos.includes('head')) return 0.7;
    if (pos.includes('manager') || pos.includes('lead')) return 0.6;
    
    return 0.5;
  }

  /**
   * Print summary statistics
   */
  printSummary() {
    const duration = new Date() - this.stats.startTime;
    
    console.log('\n📊 Connection Enrichment Summary:');
    console.log(`   ✅ Connections Created: ${this.stats.connectionsCreated}`);
    console.log(`   ⏭️  Connections Skipped: ${this.stats.connectionsSkipped}`);
    console.log(`   ❌ Errors: ${this.stats.errors}`);
    console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   📈 Success Rate: ${this.stats.connectionsCreated + this.stats.connectionsSkipped > 0 ? 
      ((this.stats.connectionsCreated / (this.stats.connectionsCreated + this.stats.connectionsSkipped)) * 100).toFixed(1) : 0}%`);
  }
}

// Run the enrichment system
async function main() {
  const enrichmentSystem = new ConnectionEnrichmentSystem();
  await enrichmentSystem.runFullEnrichment();
}

// Export for use in other scripts
export { ConnectionEnrichmentSystem };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}




