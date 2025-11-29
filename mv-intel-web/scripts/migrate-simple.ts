#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Neo4j connection
const NEO4J_URI = process.env.NEO4J_URI!;
const NEO4J_USER = process.env.NEO4J_USER!;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

interface Entity {
  id: string;
  name: string;
  type: string;
  domain?: string;
  industry?: string;
  pipeline_stage?: string;
  fund?: string;
  taxonomy?: string;
  valuation_amount?: number;
  investment_amount?: number;
  year_founded?: number;
  employee_count?: number;
  location_city?: string;
  location_country?: string;
  urgency?: string;
  series?: string;
  founder_gender?: string;
  pass_lost_reason?: string;
  sourced_by?: string;
  notion_page?: string;
  related_deals?: string[];
  apollo_taxonomy?: string;
  brief_description?: string;
  source?: string;
  affinity_org_id?: number;
  affinity_person_id?: number;
  linkedin_url?: string;
  enrichment_data?: any;
  employment_history?: any;
  publications?: any;
  areas_of_expertise?: string[];
  is_internal?: boolean;
  is_portfolio?: boolean;
  is_pipeline?: boolean;
  importance?: number;
  created_at?: string;
  updated_at?: string;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score?: number;
  interaction_count?: number;
  created_at?: string;
  updated_at?: string;
}

class SimpleNeo4jMigration {
  private batchSize = 1000;
  private delayMs = 100;

  async migrate() {
    console.log('🚀 Starting Neo4j migration...');
    
    try {
      // Test connection
      const session = driver.session({ database: NEO4J_DATABASE });
      await session.run('RETURN 1');
      console.log('✅ Neo4j connection successful');
      await session.close();

      // Get total counts
      const { count: totalEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });

      const { count: totalEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 Found ${totalEntities} entities and ${totalEdges} edges`);

      // Clear existing data
      console.log('🧹 Clearing existing Neo4j data...');
      await this.clearNeo4jData();

      // Create constraints and indexes
      console.log('🔧 Creating constraints and indexes...');
      await this.createConstraints();

      // Migrate entities in batches
      console.log('📦 Migrating entities...');
      await this.migrateEntities();

      // Migrate edges in batches
      console.log('🔗 Migrating edges...');
      await this.migrateEdges();

      // Verify migration
      console.log('✅ Verifying migration...');
      await this.verifyMigration();

      console.log('🎉 Migration completed successfully!');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await driver.close();
    }
  }

  private async clearNeo4jData() {
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
      await session.run('MATCH ()-[r]->() DELETE r');
      await session.run('MATCH (n) DELETE n');
      console.log('✅ Cleared existing data');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private async createConstraints() {
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
      await session.run('CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE');
      await session.run('CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)');
      await session.run('CREATE INDEX entity_industry IF NOT EXISTS FOR (e:Entity) ON (e.industry)');
      await session.run('CREATE INDEX entity_pipeline_stage IF NOT EXISTS FOR (e:Entity) ON (e.pipeline_stage)');
      await session.run('CREATE INDEX entity_is_internal IF NOT EXISTS FOR (e:Entity) ON (e.is_internal)');
      
      console.log('✅ Created constraints and indexes');
    } catch (error) {
      console.error('Error creating constraints:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private async migrateEntities() {
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .range(offset, offset + this.batchSize - 1);

      if (error) {
        throw new Error(`Failed to fetch entities: ${error.message}`);
      }

      if (!entities || entities.length === 0) {
        break;
      }

      await this.batchCreateEntities(entities as Entity[]);
      
      totalMigrated += entities.length;
      offset += this.batchSize;
      
      console.log(`📦 Migrated ${totalMigrated} entities...`);
      
      await this.delay(this.delayMs);
    }

    console.log(`✅ Migrated ${totalMigrated} entities total`);
  }

  private async batchCreateEntities(entities: Entity[]) {
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
      // Pre-process entities to convert complex objects to JSON strings
      const processedEntities = entities.map(entity => ({
        ...entity,
        enrichment_data: entity.enrichment_data ? JSON.stringify(entity.enrichment_data) : null,
        employment_history: entity.employment_history ? JSON.stringify(entity.employment_history) : null,
        publications: entity.publications ? JSON.stringify(entity.publications) : null,
      }));

      const query = `
        UNWIND $entities AS entity
        CREATE (e:Entity {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          domain: entity.domain,
          industry: entity.industry,
          pipeline_stage: entity.pipeline_stage,
          fund: entity.fund,
          taxonomy: entity.taxonomy,
          valuation_amount: entity.valuation_amount,
          investment_amount: entity.investment_amount,
          year_founded: entity.year_founded,
          employee_count: entity.employee_count,
          location_city: entity.location_city,
          location_country: entity.location_country,
          urgency: entity.urgency,
          series: entity.series,
          founder_gender: entity.founder_gender,
          pass_lost_reason: entity.pass_lost_reason,
          sourced_by: entity.sourced_by,
          notion_page: entity.notion_page,
          related_deals: entity.related_deals,
          apollo_taxonomy: entity.apollo_taxonomy,
          brief_description: entity.brief_description,
          source: entity.source,
          affinity_org_id: entity.affinity_org_id,
          affinity_person_id: entity.affinity_person_id,
          linkedin_url: entity.linkedin_url,
          enrichment_data: entity.enrichment_data,
          employment_history: entity.employment_history,
          publications: entity.publications,
          areas_of_expertise: entity.areas_of_expertise,
          is_internal: entity.is_internal,
          is_portfolio: entity.is_portfolio,
          is_pipeline: entity.is_pipeline,
          importance: entity.importance,
          created_at: entity.created_at,
          updated_at: entity.updated_at
        })
      `;

      await session.run(query, { entities: processedEntities });
    } catch (error) {
      console.error('Error creating entities batch:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private async migrateEdges() {
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('*')
        .range(offset, offset + this.batchSize - 1);

      if (error) {
        throw new Error(`Failed to fetch edges: ${error.message}`);
      }

      if (!edges || edges.length === 0) {
        break;
      }

      await this.batchCreateEdges(edges as Edge[]);
      
      totalMigrated += edges.length;
      offset += this.batchSize;
      
      console.log(`🔗 Migrated ${totalMigrated} edges...`);
      
      await this.delay(this.delayMs);
    }

    console.log(`✅ Migrated ${totalMigrated} edges total`);
  }

  private async batchCreateEdges(edges: Edge[]) {
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
      const query = `
        UNWIND $edges AS edge
        MATCH (source:Entity {id: edge.source})
        MATCH (target:Entity {id: edge.target})
        CREATE (source)-[r:RELATES {
          id: edge.id,
          kind: edge.kind,
          strength_score: edge.strength_score,
          interaction_count: edge.interaction_count,
          created_at: edge.created_at,
          updated_at: edge.updated_at
        }]->(target)
      `;

      await session.run(query, { edges });
    } catch (error) {
      console.error('Error creating edges batch:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private async verifyMigration() {
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
      const nodeResult = await session.run('MATCH (n) RETURN count(n) as nodeCount');
      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as relCount');
      
      const nodeCount = nodeResult.records[0].get('nodeCount').toNumber();
      const relCount = relResult.records[0].get('relCount').toNumber();
      
      console.log(`📊 Verification Results:`);
      console.log(`- Nodes: ${nodeCount}`);
      console.log(`- Relationships: ${relCount}`);
      
    } catch (error) {
      console.error('Error verifying migration:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new SimpleNeo4jMigration();
  migration.migrate()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default SimpleNeo4jMigration;
