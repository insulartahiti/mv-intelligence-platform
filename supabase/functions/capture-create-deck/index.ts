import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Enable CORS for testing
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    console.log('🚀 capture-create-deck function called');
    
    // SIMPLIFIED: No JWT authentication for testing
    const { title, sourceUrl, provider = "OTHER", sourcePlatformRaw } = await req.json();
    console.log('📥 Received data:', { title, sourceUrl, provider, sourcePlatformRaw });
    
    // Create Supabase client with anon key (allows authenticated access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return new Response(JSON.stringify({ error: { message: 'Server configuration error' } }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created');
    
    // For now, just return success without database insert
    // This allows us to test the full flow without database complexity
    console.log('📝 Test mode - returning mock artifact ID');
    
    const mockArtifactId = 'mock-' + Date.now();
    console.log('✅ Mock artifact ID generated:', mockArtifactId);
    
    return new Response(JSON.stringify({ 
      artifactId: mockArtifactId,
      message: "Test mode - mock response",
      data: { title, sourceUrl, provider, sourcePlatformRaw }
    }), { 
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*'
      } 
    });
    
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: { message: error.message } }), { 
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});
