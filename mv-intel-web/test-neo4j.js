#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

async function testNeo4jConnection() {
  const neo4j = require('neo4j-driver');
  
  const NEO4J_URI = process.env.NEO4J_URI;
  const NEO4J_USER = process.env.NEO4J_USER;
  const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
  const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

  console.log('🧪 Testing Neo4j AuraDB Free setup...\n');
  console.log('Environment variables:');
  console.log('- NEO4J_URI:', NEO4J_URI ? '✅ Set' : '❌ Missing');
  console.log('- NEO4J_USER:', NEO4J_USER ? '✅ Set' : '❌ Missing');
  console.log('- NEO4J_PASSWORD:', NEO4J_PASSWORD ? '✅ Set' : '❌ Missing');
  console.log('- NEO4J_DATABASE:', NEO4J_DATABASE);
  console.log('');

  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.log('❌ Missing required environment variables');
    console.log('Please check your .env.local file');
    process.exit(1);
  }

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  try {
    console.log('1. Testing connection...');
    const session = driver.session({ database: NEO4J_DATABASE });
    
    const result = await session.run('RETURN 1 as test');
    console.log('✅ Neo4j connection successful');
    
    // Get database info
    console.log('\n2. Getting database info...');
    const nodeResult = await session.run('MATCH (n) RETURN count(n) as nodeCount');
    const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as relCount');
    
    const nodeCount = nodeResult.records[0].get('nodeCount').toNumber();
    const relCount = relResult.records[0].get('relCount').toNumber();
    
    console.log('✅ Database info:');
    console.log(`- Nodes: ${nodeCount}`);
    console.log(`- Relationships: ${relCount}`);
    console.log(`- Database: ${NEO4J_DATABASE}`);
    console.log(`- URI: ${NEO4J_URI.replace(/\/\/.*@/, '//***@')}`);
    
    await session.close();
    await driver.close();
    
    console.log('\n🎉 Neo4j setup is working correctly!');
    console.log('\nNext steps:');
    console.log('1. Run migration: npm run migrate:neo4j');
    console.log('2. Test API: curl http://localhost:3000/api/neo4j/test-connection');
    console.log('3. Load graph: curl http://localhost:3000/api/neo4j/graph-data?limit=100');

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check your .env.local file');
    console.log('2. Verify the Neo4j AuraDB instance is running');
    console.log('3. Check if the password is correct');
    process.exit(1);
  }
}

testNeo4jConnection();
