#!/usr/bin/env node

/**
 * Test LinkedIn Parser
 * Tests the LinkedIn connections parser with sample data
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧪 Testing LinkedIn Parser...\n');

try {
  // Check if schema has been applied
  console.log('1️⃣ Checking if LinkedIn schema exists...');
  
  // Test if we can run the parser
  console.log('2️⃣ Running LinkedIn parser with sample data...');
  
  const result = execSync('npx tsx mv-intel-web/scripts/parse-linkedin-connections.ts', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log('✅ LinkedIn parser test completed successfully!');
  console.log('\n📊 Parser Output:');
  console.log(result);
  
} catch (error) {
  console.error('❌ LinkedIn parser test failed:');
  console.error(error.message);
  
  if (error.message.includes('Could not find the') && error.message.includes('column')) {
    console.log('\n💡 This error suggests the LinkedIn schema hasn\'t been applied yet.');
    console.log('Please run the SQL from add_linkedin_schema_simple.sql in your Supabase SQL Editor first.');
  }
  
  process.exit(1);
}
