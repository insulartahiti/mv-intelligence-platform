import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
      }
    ];

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const index of indexes) {
      try {
        console.log(`Creating ${index.name}...`);
        await session.run(index.query);
        results.push({
          name: index.name,
          status: 'success',
          description: index.description
        });
        successCount++;
      } catch (error: any) {
        results.push({
          name: index.name,
          status: 'error',
          description: index.description,
          error: error.message
        });
        errorCount++;
      }
    }

    // Show existing indexes
    const indexResult = await session.run('SHOW INDEXES');
    const existingIndexes = indexResult.records.map(record => {
      const index = record.toObject();
      return {
        name: index.name,
        state: index.state,
        type: index.type
      };
    });

    return NextResponse.json({
      success: true,
      message: `Index creation completed: ${successCount} successful, ${errorCount} failed`,
      results,
      existingIndexes,
      summary: {
        totalCreated: successCount,
        totalFailed: errorCount,
        totalExisting: existingIndexes.length
      }
    });

  } catch (error: any) {
    console.error('Error creating indexes:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Failed to create indexes' 
      },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
