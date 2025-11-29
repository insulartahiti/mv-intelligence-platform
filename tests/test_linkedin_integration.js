// LinkedIn Integration Test Script
// Run this after setting up your LinkedIn app

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const WEBHOOK_SECRET = 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';

async function testLinkedInIntegration() {
  console.log('🚀 Testing LinkedIn Integration...\n');

  try {
    // Test 1: Get Auth URL
    console.log('1. Testing Auth URL Generation...');
    const authResponse = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-api-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        action: 'get_auth_url'
      })
    });

    const authData = await authResponse.json();
    
    if (authData.ok) {
      console.log('✅ Auth URL generated successfully');
      console.log('🔗 Auth URL:', authData.auth_url);
      console.log('📝 Next: Click the URL to authorize and get the code\n');
    } else {
      console.log('❌ Auth URL generation failed:', authData.error);
      return;
    }

    // Test 2: Check if we have a contact to test with
    console.log('2. Checking for test contact...');
    const contactResponse = await fetch(`${SUPABASE_URL}/rest/v1/contacts?select=id,name&limit=1`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });

    const contacts = await contactResponse.json();
    
    if (contacts && contacts.length > 0) {
      console.log('✅ Found test contact:', contacts[0].name, '(ID:', contacts[0].id, ')');
      console.log('📝 Use this contact ID for testing\n');
    } else {
      console.log('⚠️  No contacts found. Create a contact first or sync some data.\n');
    }

    // Test 3: Check environment variables
    console.log('3. Checking environment variables...');
    if (authData.auth_url.includes('undefined')) {
      console.log('❌ Environment variables not set properly');
      console.log('📝 Set these in Supabase project settings:');
      console.log('   - LINKEDIN_CLIENT_ID');
      console.log('   - LINKEDIN_CLIENT_SECRET');
      console.log('   - LINKEDIN_REDIRECT_URI');
    } else {
      console.log('✅ Environment variables appear to be set');
    }

    console.log('\n🎯 Next Steps:');
    console.log('1. Set up LinkedIn app at https://www.linkedin.com/developers/');
    console.log('2. Set environment variables in Supabase');
    console.log('3. Redeploy the LinkedIn API function');
    console.log('4. Test the OAuth flow in the web interface');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testLinkedInIntegration();
