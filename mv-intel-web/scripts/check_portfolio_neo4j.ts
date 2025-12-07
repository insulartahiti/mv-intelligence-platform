import { getDriver, NEO4J_DATABASE } from '../lib/neo4j';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function checkPortfolio() {
  const driver = getDriver();
  if (!driver) {
    console.error('Failed to initialize Neo4j driver');
    process.exit(1);
  }

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log('Checking for portfolio entities in Neo4j...');
    
    // Check count by type
    const countResult = await session.run(`
      MATCH (n:Entity)
      WHERE n.is_portfolio = true
      RETURN n.type as type, count(n) as count
    `);
    
    console.log('Counts by type:');
    countResult.records.forEach(record => {
      console.log(`${record.get('type')}: ${record.get('count').toNumber()}`);
    });

    // Check sample organizations
    const orgResult = await session.run(`
      MATCH (n:Entity)
      WHERE n.is_portfolio = true AND n.type = 'organization'
      RETURN n
      LIMIT 3
    `);

    console.log('\nSample portfolio organizations:');
    orgResult.records.forEach(record => {
      const node = record.get('n');
      console.log(JSON.stringify(node.properties, null, 2));
    });

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkPortfolio();
