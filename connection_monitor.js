require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Connection Monitor - Analyze and validate graph connections
 * 
 * This script provides insights into the current state of connections
 * and identifies areas for improvement.
 */

class ConnectionMonitor {
  constructor() {
    this.stats = {
      totalEntities: 0,
      totalEdges: 0,
      averageConnections: 0,
      connectionTypes: {},
      missingConnections: [],
      recommendations: []
    };
  }

  /**
   * Run comprehensive analysis
   */
  async analyze() {
    console.log('🔍 Connection Monitor - Analyzing Knowledge Graph...\n');
    
    try {
      await this.getBasicStats();
      await this.analyzeConnectionTypes();
      await this.findMissingConnections();
      await this.generateRecommendations();
      this.printReport();
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
    }
  }

  /**
   * Get basic graph statistics
   */
  async getBasicStats() {
    console.log('📊 1. Basic Statistics...');
    
    const { count: totalEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true });

    const { count: totalEdges } = await supabase
      .schema('graph')
      .from('edges')
      .select('*', { count: 'exact', head: true });

    this.stats.totalEntities = totalEntities || 0;
    this.stats.totalEdges = totalEdges || 0;
    this.stats.averageConnections = totalEntities ? (totalEdges / totalEntities) : 0;

    console.log(`   Total Entities: ${this.stats.totalEntities}`);
    console.log(`   Total Edges: ${this.stats.totalEdges}`);
    console.log(`   Average Connections per Entity: ${this.stats.averageConnections.toFixed(2)}`);
  }

  /**
   * Analyze connection types
   */
  async analyzeConnectionTypes() {
    console.log('\n🔗 2. Connection Type Analysis...');
    
    const { data: edges } = await supabase
      .schema('graph')
      .from('edges')
      .select('kind, strength_score')
      .not('kind', 'is', null);

    const typeStats = {};
    for (const edge of edges || []) {
      if (!typeStats[edge.kind]) {
        typeStats[edge.kind] = { count: 0, totalStrength: 0, avgStrength: 0 };
      }
      typeStats[edge.kind].count++;
      typeStats[edge.kind].totalStrength += edge.strength_score || 0;
    }

    // Calculate averages
    for (const [kind, stats] of Object.entries(typeStats)) {
      stats.avgStrength = stats.totalStrength / stats.count;
    }

    this.stats.connectionTypes = typeStats;

    console.log('   Connection Types:');
    for (const [kind, stats] of Object.entries(typeStats)) {
      console.log(`     ${kind}: ${stats.count} connections (avg strength: ${stats.avgStrength.toFixed(2)})`);
    }
  }

  /**
   * Find missing connections
   */
  async findMissingConnections() {
    console.log('\n🔍 3. Missing Connection Analysis...');
    
    // Check portfolio companies
    const { data: portfolioCompanies } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('is_portfolio', true)
      .limit(10);

    const { data: motivePartners } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('name', 'Motive Partners')
      .eq('type', 'organization')
      .single();

    if (motivePartners && portfolioCompanies) {
      let missingPortfolio = 0;
      for (const company of portfolioCompanies) {
        const { data: edge } = await supabase
          .schema('graph')
          .from('edges')
          .select('id')
          .or(`source.eq.${company.id},target.eq.${company.id}`)
          .or(`source.eq.${motivePartners.id},target.eq.${motivePartners.id}`);

        const hasConnection = edge?.some(e => 
          (e.source === company.id && e.target === motivePartners.id) ||
          (e.source === motivePartners.id && e.target === company.id)
        );

        if (!hasConnection) {
          missingPortfolio++;
          this.stats.missingConnections.push({
            type: 'portfolio',
            description: `${company.name} → Motive Partners`,
            priority: 'high'
          });
        }
      }
      console.log(`   Missing portfolio connections: ${missingPortfolio}`);
    }

    // Check LinkedIn connections
    const { data: linkedinConnections } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('enrichment_data->linkedin_first_degree', true)
      .eq('type', 'person')
      .limit(10);

    const { data: harsh } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('name', 'Harsh Govil')
      .eq('type', 'person')
      .single();

    if (harsh && linkedinConnections) {
      let missingLinkedIn = 0;
      for (const person of linkedinConnections) {
        const { data: edge } = await supabase
          .schema('graph')
          .from('edges')
          .select('id')
          .or(`source.eq.${person.id},target.eq.${harsh.id}`)
          .or(`source.eq.${harsh.id},target.eq.${person.id}`);

        const hasConnection = edge?.some(e => 
          (e.source === person.id && e.target === harsh.id) ||
          (e.source === harsh.id && e.target === person.id)
        );

        if (!hasConnection) {
          missingLinkedIn++;
          this.stats.missingConnections.push({
            type: 'linkedin',
            description: `Harsh → ${person.name}`,
            priority: 'medium'
          });
        }
      }
      console.log(`   Missing LinkedIn connections: ${missingLinkedIn}`);
    }

    console.log(`   Total missing connections identified: ${this.stats.missingConnections.length}`);
  }

  /**
   * Generate recommendations
   */
  async generateRecommendations() {
    console.log('\n💡 4. Recommendations...');
    
    const recommendations = [];

    // Graph density recommendations
    if (this.stats.averageConnections < 1.0) {
      recommendations.push({
        priority: 'high',
        category: 'density',
        title: 'Low Graph Density',
        description: `Average connections per entity is ${this.stats.averageConnections.toFixed(2)}. Consider enriching with more relationship data.`,
        action: 'Run comprehensive connection enrichment'
      });
    }

    // Missing connection recommendations
    const highPriorityMissing = this.stats.missingConnections.filter(c => c.priority === 'high');
    if (highPriorityMissing.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'missing',
        title: 'Critical Missing Connections',
        description: `${highPriorityMissing.length} high-priority connections missing`,
        action: 'Run quick connection fix script'
      });
    }

    // Connection type recommendations
    const colleagueConnections = this.stats.connectionTypes['colleague']?.count || 0;
    if (colleagueConnections < 50) {
      recommendations.push({
        priority: 'medium',
        category: 'types',
        title: 'Low Colleague Connections',
        description: `Only ${colleagueConnections} colleague connections found`,
        action: 'Enrich LinkedIn and deal team relationships'
      });
    }

    this.stats.recommendations = recommendations;

    recommendations.forEach((rec, i) => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`   ${priorityIcon} ${rec.title}`);
      console.log(`      ${rec.description}`);
      console.log(`      Action: ${rec.action}\n`);
    });
  }

  /**
   * Print comprehensive report
   */
  printReport() {
    console.log('\n📋 Connection Monitor Report');
    console.log('='.repeat(50));
    
    console.log('\n📊 Current State:');
    console.log(`   Entities: ${this.stats.totalEntities}`);
    console.log(`   Edges: ${this.stats.totalEdges}`);
    console.log(`   Density: ${this.stats.averageConnections.toFixed(2)} connections/entity`);
    
    console.log('\n🔗 Connection Types:');
    for (const [kind, stats] of Object.entries(this.stats.connectionTypes)) {
      console.log(`   ${kind}: ${stats.count} (avg strength: ${stats.avgStrength.toFixed(2)})`);
    }
    
    console.log('\n❌ Missing Connections:');
    this.stats.missingConnections.forEach((conn, i) => {
      const priorityIcon = conn.priority === 'high' ? '🔴' : conn.priority === 'medium' ? '🟡' : '🟢';
      console.log(`   ${priorityIcon} ${conn.description}`);
    });
    
    console.log('\n💡 Recommendations:');
    this.stats.recommendations.forEach((rec, i) => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`   ${priorityIcon} ${rec.title}: ${rec.action}`);
    });
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Run quick_connection_fix.js for immediate improvements');
    console.log('   2. Run connection_enrichment_system.js for comprehensive enrichment');
    console.log('   3. Monitor connection query performance');
    console.log('   4. Set up automated connection discovery');
  }
}

// Run the monitor
async function main() {
  const monitor = new ConnectionMonitor();
  await monitor.analyze();
}

main().catch(console.error);
