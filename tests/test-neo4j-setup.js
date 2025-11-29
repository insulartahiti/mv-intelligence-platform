#!/usr/bin/env node

require('dotenv').config();
const { testNeo4jConnection, getNeo4jInfo } = require('./mv-intel-web/lib/neo4j');

async function testSetup() {
  console.log('🧪 Testing Neo4j AuraDB Free setup...\n');

  try {
    // Test connection
    console.log('1. Testing connection...');
    const isConnected = await testNeo4jConnection();
    
    if (!isConnected) {
      console.log('❌ Connection failed. Please check your environment variables.');
      console.log('Make sure you have:');
      console.log('- NEO4J_URI');
      console.log('- NEO4J_USER');
      console.log('- NEO4J_PASSWORD');
      process.exit(1);
    }

    // Get database info
    console.log('\n2. Getting database info...');
    const info = await getNeo4jInfo();
    
    if (info) {
      console.log('✅ Database info:');
      console.log(`- Nodes: ${info.nodeCount}`);
      console.log(`- Relationships: ${info.relCount}`);
      console.log(`- Database: ${info.database}`);
      console.log(`- URI: ${info.uri}`);
    }

    console.log('\n🎉 Neo4j setup is working correctly!');
    console.log('\nNext steps:');
    console.log('1. Run migration: npm run migrate:neo4j');
    console.log('2. Test API: curl http://localhost:3000/api/neo4j/test-connection');
    console.log('3. Load graph: curl http://localhost:3000/api/neo4j/graph-data?limit=100');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testSetup();
