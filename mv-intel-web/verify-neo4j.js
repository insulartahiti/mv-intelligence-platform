const neo4j = require('neo4j-driver');
require('dotenv').config({ path: '.env.local' });

const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function verify() {
    const session = driver.session();
    try {
        // Check LinkedIn edges
        const result = await session.run(`
      MATCH ()-[r:linkedin_connection]->()
      RETURN count(r) as count
    `);
        const count = result.records[0].get('count').toNumber();
        console.log(`✅ LinkedIn Connections in Neo4j: ${count}`);

        // Check all edge types
        const result3 = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(r) as count
      ORDER BY count DESC
    `);
        console.log('\n📊 Edge Types:');
        result3.records.forEach(r => {
            console.log(`  - ${r.get('type')}: ${r.get('count').toNumber()}`);
        });

        // Check total entities
        const result2 = await session.run(`
      MATCH (n)
      RETURN count(n) as count
    `);
        const count2 = result2.records[0].get('count').toNumber();
        console.log(`✅ Total Nodes in Neo4j: ${count2}`);

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await session.close();
        await driver.close();
    }
}

verify();
