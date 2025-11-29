/**
 * Create Neo4j Indexes for Performance Optimization
 * Run this script to create indexes that will significantly improve query performance
 */

require('dotenv').config({ path: '.env.local' });
const { driver, NEO4J_DATABASE } = require('../lib/neo4j.ts');

async function createIndexes() {
  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log('🚀 Creating Neo4j indexes for performance optimization...');

    const indexes = [
      // Basic property indexes
      {
        name: 'entity_type_index',
        query: 'CREATE INDEX entity_type_index IF NOT EXISTS FOR (n:Entity) ON (n.type)',
        description: 'Index on entity type for fast filtering'
      },
      {
        name: 'entity_importance_index',
        query: 'CREATE INDEX entity_importance_index IF NOT EXISTS FOR (n:Entity) ON (n.importance)',
        description: 'Index on importance score for ranking queries'
      },
      {
        name: 'entity_industry_index',
        query: 'CREATE INDEX entity_industry_index IF NOT EXISTS FOR (n:Entity) ON (n.industry)',
        description: 'Index on industry for filtering'
      },
      {
        name: 'entity_pipeline_stage_index',
        query: 'CREATE INDEX entity_pipeline_stage_index IF NOT EXISTS FOR (n:Entity) ON (n.pipeline_stage)',
        description: 'Index on pipeline stage for filtering'
      },
      {
        name: 'entity_fund_index',
        query: 'CREATE INDEX entity_fund_index IF NOT EXISTS FOR (n:Entity) ON (n.fund)',
        description: 'Index on fund for filtering'
      },
      {
        name: 'entity_domain_index',
        query: 'CREATE INDEX entity_domain_index IF NOT EXISTS FOR (n:Entity) ON (n.domain)',
        description: 'Index on domain for text search'
      },
      {
        name: 'entity_name_index',
        query: 'CREATE INDEX entity_name_index IF NOT EXISTS FOR (n:Entity) ON (n.name)',
        description: 'Index on name for text search'
      },

      // Boolean property indexes
      {
        name: 'entity_internal_index',
        query: 'CREATE INDEX entity_internal_index IF NOT EXISTS FOR (n:Entity) ON (n.is_internal)',
        description: 'Index on internal flag for filtering'
      },
      {
        name: 'entity_portfolio_index',
        query: 'CREATE INDEX entity_portfolio_index IF NOT EXISTS FOR (n:Entity) ON (n.is_portfolio)',
        description: 'Index on portfolio flag for filtering'
      },
      {
        name: 'entity_pipeline_index',
        query: 'CREATE INDEX entity_pipeline_index IF NOT EXISTS FOR (n:Entity) ON (n.is_pipeline)',
        description: 'Index on pipeline flag for filtering'
      },
      {
        name: 'entity_linkedin_index',
        query: 'CREATE INDEX entity_linkedin_index IF NOT EXISTS FOR (n:Entity) ON (n.linkedin_first_degree)',
        description: 'Index on LinkedIn first degree flag'
      },

      // Composite indexes for common query patterns
      {
        name: 'entity_type_importance_index',
        query: 'CREATE INDEX entity_type_importance_index IF NOT EXISTS FOR (n:Entity) ON (n.type, n.importance)',
        description: 'Composite index for type + importance queries'
      },
      {
        name: 'entity_internal_importance_index',
        query: 'CREATE INDEX entity_internal_importance_index IF NOT EXISTS FOR (n:Entity) ON (n.is_internal, n.importance)',
        description: 'Composite index for internal + importance queries'
      },
      {
        name: 'entity_portfolio_pipeline_index',
        query: 'CREATE INDEX entity_portfolio_pipeline_index IF NOT EXISTS FOR (n:Entity) ON (n.is_portfolio, n.is_pipeline)',
        description: 'Composite index for portfolio/pipeline queries'
      },

      // Text search indexes
      {
        name: 'entity_name_text_index',
        query: 'CREATE FULLTEXT INDEX entity_name_text_index IF NOT EXISTS FOR (n:Entity) ON EACH [n.name]',
        description: 'Full-text index on entity names'
      },
      {
        name: 'entity_ai_summary_text_index',
        query: 'CREATE FULLTEXT INDEX entity_ai_summary_text_index IF NOT EXISTS FOR (n:Entity) ON EACH [n.ai_summary]',
        description: 'Full-text index on AI summaries'
      },

      // Vector index for embeddings (if supported)
      {
        name: 'entity_embedding_vector_index',
        query: 'CREATE VECTOR INDEX entity_embedding_vector_index IF NOT EXISTS FOR (n:Entity) ON (n.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 3072, `vector.similarity_function`: "cosine"}}',
        description: 'Vector index for semantic similarity search'
      }
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const index of indexes) {
      try {
        console.log(`Creating ${index.name}...`);
        await session.run(index.query);
        console.log(`✅ ${index.name}: ${index.description}`);
        successCount++;
      } catch (error) {
        console.log(`❌ ${index.name}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Index Creation Summary:`);
    console.log(`✅ Successfully created: ${successCount} indexes`);
    console.log(`❌ Failed to create: ${errorCount} indexes`);

    // Show existing indexes
    console.log('\n📋 Current indexes:');
    const indexResult = await session.run('SHOW INDEXES');
    indexResult.records.forEach(record => {
      const index = record.toObject();
      console.log(`- ${index.name}: ${index.state} (${index.type})`);
    });

  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the script
createIndexes().catch(console.error);
