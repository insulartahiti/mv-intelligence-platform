const neo4j = require('neo4j-driver');
require('dotenv').config({ path: '.env.local' });

const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function cleanup() {
    const session = driver.session();
    try {
        console.log('🧹 Cleaning up incorrect RELATES edges...');

        // Delete RELATES edges in batches
        await session.run(`
      CALL {
        MATCH ()-[r:RELATES]->()
        DELETE r
      } IN TRANSACTIONS OF 1000 ROWS
    `);

        console.log('✅ Cleared RELATES edges');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        await session.close();
        await driver.close();
    }
}

cleanup();
