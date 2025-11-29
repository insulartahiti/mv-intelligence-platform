import { driver, NEO4J_DATABASE } from '../lib/neo4j';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function checkNeo4jSchema() {
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    // Check relationship types
    const result = await session.run(`
      MATCH ()-[r]->() 
      RETURN DISTINCT type(r) as relType, count(r) as count 
      LIMIT 10
    `);
    
    console.log('Neo4j Relationship Types:');
    result.records.forEach(record => {
      console.log(` - ${record.get('relType')}: ${record.get('count')}`);
    });

    // Check Nodes
    const nodes = await session.run(`
        MATCH (n:Entity)
        WHERE n.name CONTAINS 'Harsh Govil' OR n.name CONTAINS 'Korr'
        RETURN n.id, n.name, n.type
    `);
    console.log('\nNodes found:');
    nodes.records.forEach(record => {
        console.log(` - ${record.get('n.name')} (${record.get('n.type')}) ID: ${record.get('n.id')}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkNeo4jSchema();

