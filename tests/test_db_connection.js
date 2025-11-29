// Test database connection and table existence
const { createClient } = require('@supabase/supabase-js');

const URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');

  try {
    // Test 1: Check if email_inbox table exists
    console.log('1. Checking email_inbox table...');
    const { data: inboxData, error: inboxError } = await supabase
      .from('email_inbox')
      .select('*')
      .limit(1);

    if (inboxError) {
      console.log(`❌ email_inbox table error: ${inboxError.message}`);
    } else {
      console.log(`✅ email_inbox table exists (${inboxData.length} records)`);
    }

    // Test 2: Check if email_analysis table exists
    console.log('\n2. Checking email_analysis table...');
    const { data: analysisData, error: analysisError } = await supabase
      .from('email_analysis')
      .select('*')
      .limit(1);

    if (analysisError) {
      console.log(`❌ email_analysis table error: ${analysisError.message}`);
    } else {
      console.log(`✅ email_analysis table exists (${analysisData.length} records)`);
    }

    // Test 3: Check if email_insights table exists
    console.log('\n3. Checking email_insights table...');
    const { data: insightsData, error: insightsError } = await supabase
      .from('email_insights')
      .select('*')
      .limit(1);

    if (insightsError) {
      console.log(`❌ email_insights table error: ${insightsError.message}`);
    } else {
      console.log(`✅ email_insights table exists (${insightsData.length} records)`);
    }

    // Test 4: Check if companies table exists
    console.log('\n4. Checking companies table...');
    const { data: companiesData, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .limit(1);

    if (companiesError) {
      console.log(`❌ companies table error: ${companiesError.message}`);
    } else {
      console.log(`✅ companies table exists (${companiesData.length} records)`);
    }

    // Test 5: List all tables
    console.log('\n5. Listing all tables...');
    const { data: tablesData, error: tablesError } = await supabase
      .rpc('get_all_tables');

    if (tablesError) {
      console.log(`❌ Error listing tables: ${tablesError.message}`);
    } else {
      console.log(`✅ Found ${tablesData?.length || 0} tables`);
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
  }

  console.log('\n🎉 Database connection test completed!');
}

testDatabaseConnection().catch(console.error);






