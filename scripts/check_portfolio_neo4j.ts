
import { getDriver, NEO4J_DATABASE } from '../mv-intel-web/lib/neo4j';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: 'mv-intel-web/.env.local' });

async function checkPortfolio() {
  const driver = getDriver();
  if (!driver) {
    console.error('Failed to initialize Neo4j driver');
    process.exit(1);
  }

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log('Checking for portfolio companies in Neo4j...');
    
    // Check count
    const countResult = await session.run(`
      MATCH (n:Entity)
      WHERE n.is_portfolio = true
      RETURN count(n) as count
    `);
    
    const count = countResult.records[0].get('count').toNumber();
    console.log(`Found ${count} portfolio companies.`);

    if (count > 0) {
      // Get sample
      const result = await session.run(`
        MATCH (n:Entity)
        WHERE n.is_portfolio = true
        RETURN n
        LIMIT 5
      `);

      console.log('Sample companies:');
      result.records.forEach(record => {
        const node = record.get('n');
        console.log(JSON.stringify(node.properties, null, 2));
      });
    }

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkPortfolio();

