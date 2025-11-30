#!/usr/bin/env tsx

// Load environment variables FIRST, before any imports
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import neo4j from 'neo4j-driver';

// Verify environment variables are loaded
if (!process.env.NEO4J_URI || !process.env.NEO4J_USER || !process.env.NEO4J_PASSWORD) {
  console.error('❌ Missing Neo4j environment variables:');
  console.error('NEO4J_URI:', process.env.NEO4J_URI ? 'Set' : 'MISSING');
  console.error('NEO4J_USER:', process.env.NEO4J_USER ? 'Set' : 'MISSING');
  console.error('NEO4J_PASSWORD:', process.env.NEO4J_PASSWORD ? 'Set' : 'MISSING');
  process.exit(1);
}

const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  embedding?: number[];
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

class Neo4jMigration {
  private batchSize = 50; // Minimal batch size
  private delayMs = 500; // Longer delay to let server recover
  async migrate() {
    console.log('🚀 Starting Neo4j migration...');

    try {
      const session = driver.session({ database: NEO4J_DATABASE });
      await session.run('RETURN 1');
      console.log('✅ Neo4j connection successful');
      await session.close();

      const { count: totalEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });

      const { count: totalEdges } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 Found ${totalEntities} entities and ${totalEdges} edges`);

      // Skip clearing data to avoid timeouts on Aura Free tier
      // await this.clearNeo4jData();
      console.log('ℹ️  Skipping data clear (incremental update mode)');

      console.log('🔧 Creating constraints and indexes...');
      await this.createConstraints();

      console.log('📦 Migrating entities...');
      await this.migrateEntities();

      console.log('🔗 Migrating edges...');
      await this.migrateEdges();

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
      // Use batch deletion to avoid timeouts on large datasets
      // AuraDB Free tier has strict memory limits, so we use small batches

      // 1. Delete relationships first (lighter)
      await session.run(`
        CALL {
          MATCH ()-[r]->()
          DELETE r
        } IN TRANSACTIONS OF 100 ROWS
      `);
      console.log('✅ Cleared relationships');

      // 2. Delete nodes
      await session.run(`
        CALL {
          MATCH (n)
          DELETE n
        } IN TRANSACTIONS OF 100 ROWS
      `);
      console.log('✅ Cleared nodes');

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
      let retries = 3;
      let entities = null;
      let error = null;

      while (retries > 0) {
        const result = await supabase
          .schema('graph')
          .from('entities')
          .select('*')
          .range(offset, offset + this.batchSize - 1);
        
        if (!result.error) {
          entities = result.data;
          break;
        }

        console.warn(`⚠️ Fetch failed, retrying... (${retries} attempts left): ${result.error.message}`);
        retries--;
        await this.delay(2000);
        
        if (retries === 0) {
          error = result.error;
        }
      }

      if (error) {
        throw new Error(`Failed to fetch entities after retries: ${error.message}`);
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
      // Serialize complex properties to JSON strings
      const serializedEntities = entities.map(entity => ({
        ...entity,
        related_deals: entity.related_deals ? JSON.stringify(entity.related_deals) : null,
        enrichment_data: entity.enrichment_data ? JSON.stringify(entity.enrichment_data) : null,
        employment_history: entity.employment_history ? JSON.stringify(entity.employment_history) : null,
        publications: entity.publications ? JSON.stringify(entity.publications) : null,
        areas_of_expertise: entity.areas_of_expertise ? JSON.stringify(entity.areas_of_expertise) : null,
        embedding: null // Don't store embeddings in Neo4j (use Postgres for vector search)
      }));

      const query = `
        UNWIND $entities AS entity
        MERGE (e:Entity {id: entity.id})
        SET e.name = entity.name,
            e.type = entity.type,
            e.domain = entity.domain,
            e.industry = entity.industry,
            e.pipeline_stage = entity.pipeline_stage,
            e.fund = entity.fund,
            e.taxonomy = entity.taxonomy,
            e.valuation_amount = entity.valuation_amount,
            e.investment_amount = entity.investment_amount,
            e.year_founded = entity.year_founded,
            e.employee_count = entity.employee_count,
            e.location_city = entity.location_city,
            e.location_country = entity.location_country,
            e.urgency = entity.urgency,
            e.series = entity.series,
            e.founder_gender = entity.founder_gender,
            e.pass_lost_reason = entity.pass_lost_reason,
            e.sourced_by = entity.sourced_by,
            e.notion_page = entity.notion_page,
            e.related_deals = entity.related_deals,
            e.apollo_taxonomy = entity.apollo_taxonomy,
            e.brief_description = entity.brief_description,
            e.source = entity.source,
            e.affinity_org_id = entity.affinity_org_id,
            e.affinity_person_id = entity.affinity_person_id,
            e.linkedin_url = entity.linkedin_url,
            e.enrichment_data = entity.enrichment_data,
            e.employment_history = entity.employment_history,
            e.publications = entity.publications,
            e.areas_of_expertise = entity.areas_of_expertise,
            e.is_internal = entity.is_internal,
            e.is_portfolio = entity.is_portfolio,
            e.is_pipeline = entity.is_pipeline,
            e.importance = entity.importance,
            e.created_at = entity.created_at,
            e.updated_at = entity.updated_at
      `;

      await session.run(query, { entities: serializedEntities });
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
      let retries = 3;
      let edges = null;
      let error = null;

      while (retries > 0) {
        const result = await supabase
          .schema('graph')
          .from('edges')
          .select('*')
          .range(offset, offset + this.batchSize - 1);
        
        if (!result.error) {
          edges = result.data;
          break;
        }

        console.warn(`⚠️ Fetch failed, retrying... (${retries} attempts left): ${result.error.message}`);
        retries--;
        await this.delay(2000); // Wait 2s before retry
        
        if (retries === 0) {
          error = result.error;
        }
      }

      if (error) {
        throw new Error(`Failed to fetch edges after retries: ${error.message}`);
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
      // Group edges by kind to handle dynamic relationship types
      const edgesByKind = edges.reduce((acc, edge) => {
        const kind = edge.kind || 'RELATES';
        // Sanitize kind to be safe for Cypher (alphanumeric + underscore)
        const safeKind = kind.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();

        if (!acc[safeKind]) {
          acc[safeKind] = [];
        }
        acc[safeKind].push(edge);
        return acc;
      }, {} as Record<string, Edge[]>);

      // Process each kind
      for (const [kind, kindEdges] of Object.entries(edgesByKind)) {
        const query = `
          UNWIND $edges AS edge
          MATCH (source:Entity {id: edge.source})
          MATCH (target:Entity {id: edge.target})
          MERGE (source)-[r:${kind}]->(target)
          SET r += {
            id: edge.id,
            kind: edge.kind,
            strength_score: edge.strength_score,
            interaction_count: edge.interaction_count,
            created_at: edge.created_at,
            updated_at: edge.updated_at
          }
        `;

        await session.run(query, { edges: kindEdges });
      }
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
      const nodeCount = nodeResult.records[0].get('nodeCount').toNumber();

      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as relCount');
      const relCount = relResult.records[0].get('relCount').toNumber();

      const sampleResult = await session.run(`
        MATCH (n:Entity)
        WHERE n.is_internal = true
        RETURN n.name, n.type, n.industry
        LIMIT 5
      `);

      console.log(`📊 Verification Results:`);
      console.log(`- Nodes: ${nodeCount}`);
      console.log(`- Relationships: ${relCount}`);
      console.log(`- Sample internal entities:`);
      sampleResult.records.forEach(record => {
        console.log(`  - ${record.get('n.name')} (${record.get('n.type')}) - ${record.get('n.industry')}`);
      });

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

// Run migration
const migration = new Neo4jMigration();
migration.migrate()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
