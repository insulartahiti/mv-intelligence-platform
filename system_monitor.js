require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SystemMonitor {
  constructor() {
    this.refreshInterval = 30000; // 30 seconds
    this.isRunning = false;
  }

  async getSystemStatus() {
    try {
      // Get total entities
      const { count: totalEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });

      // Get entities with embeddings
      const { count: entitiesWithEmbeddings } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);

      // Get entities with AI summary
      const { count: entitiesWithAISummary } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('ai_summary', 'is', null);

      // Get entities with taxonomy
      const { count: entitiesWithTaxonomy } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('taxonomy', 'is', null);

      // Get entities with hybrid enhancement
      const { count: entitiesWithHybridEnhancement } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('enrichment_data->>enhancement_method', 'gpt4o_perplexity_search_hybrid');

      // Get total edges
      const { count: totalEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

      // Get LinkedIn connections
      const { count: linkedinConnections } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('enrichment_data->linkedin_first_degree', 'is', null);

      // Get Affinity entities
      const { count: affinityEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'affinity');

      // Get Affinity persons
      const { count: affinityPersons } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'person')
        .eq('source', 'affinity');

      const status = {
        totalEntities: totalEntities || 0,
        entitiesWithEmbeddings: entitiesWithEmbeddings || 0,
        embeddingCoverage: totalEntities ? ((entitiesWithEmbeddings || 0) / totalEntities * 100).toFixed(1) : 0,
        entitiesWithAISummary: entitiesWithAISummary || 0,
        aiSummaryCoverage: totalEntities ? ((entitiesWithAISummary || 0) / totalEntities * 100).toFixed(1) : 0,
        entitiesWithTaxonomy: entitiesWithTaxonomy || 0,
        taxonomyCoverage: totalEntities ? ((entitiesWithTaxonomy || 0) / totalEntities * 100).toFixed(1) : 0,
        entitiesWithHybridEnhancement: entitiesWithHybridEnhancement || 0,
        hybridEnhancementCoverage: totalEntities ? ((entitiesWithHybridEnhancement || 0) / totalEntities * 100).toFixed(1) : 0,
        totalEdges: totalEdges || 0,
        linkedinConnections: linkedinConnections || 0,
        affinityEntities: affinityEntities || 0,
        affinityPersons: affinityPersons || 0,
        affinityCoverage: totalEntities ? ((affinityEntities || 0) / totalEntities * 100).toFixed(1) : 0,
        lastUpdated: new Date().toISOString()
      };

      return status;
    } catch (error) {
      console.error('Error fetching system status:', error);
      return null;
    }
  }

  displayStatus(status) {
    if (!status) {
      console.log('❌ Failed to fetch system status');
      return;
    }

    console.log('\n📊 System Status Dashboard');
    console.log('═'.repeat(50));
    console.log(`📈 Total Entities: ${status.totalEntities.toLocaleString()}`);
    console.log(`🧠 AI Embeddings: ${status.entitiesWithEmbeddings.toLocaleString()} (${status.embeddingCoverage}%)`);
    console.log(`🤖 AI Summary: ${status.entitiesWithAISummary.toLocaleString()} (${status.aiSummaryCoverage}%)`);
    console.log(`🏷️  Taxonomy: ${status.entitiesWithTaxonomy.toLocaleString()} (${status.taxonomyCoverage}%)`);
    console.log(`🚀 Hybrid Enhancement: ${status.entitiesWithHybridEnhancement.toLocaleString()} (${status.hybridEnhancementCoverage}%)`);
    console.log('─'.repeat(50));
    console.log(`🔗 Total Edges: ${status.totalEdges.toLocaleString()}`);
    console.log(`💼 LinkedIn Connections: ${status.linkedinConnections.toLocaleString()}`);
    console.log(`🏢 Affinity Entities: ${status.affinityEntities.toLocaleString()} (${status.affinityCoverage}%)`);
    console.log(`👥 Affinity Persons: ${status.affinityPersons.toLocaleString()}`);
    console.log('─'.repeat(50));
    console.log(`🕐 Last Updated: ${new Date(status.lastUpdated).toLocaleString()}`);
    console.log('═'.repeat(50));
  }

  async start() {
    console.log('🚀 Starting System Monitor...');
    console.log(`📊 Refresh interval: ${this.refreshInterval / 1000}s`);
    
    this.isRunning = true;
    
    // Initial status
    const status = await this.getSystemStatus();
    this.displayStatus(status);
    
    // Set up interval
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      
      const status = await this.getSystemStatus();
      this.displayStatus(status);
    }, this.refreshInterval);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down system monitor...');
      this.isRunning = false;
      clearInterval(interval);
      process.exit(0);
    });
  }

  stop() {
    this.isRunning = false;
  }
}

// Run the monitor
if (require.main === module) {
  const monitor = new SystemMonitor();
  monitor.start().catch(console.error);
}

module.exports = SystemMonitor;
