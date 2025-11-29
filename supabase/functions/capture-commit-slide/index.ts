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
    console.log('🚀 capture-commit-slide function called');
    
    // SIMPLIFIED: No JWT authentication for testing
    const { artifactId, slideIndex, width, height, storagePath } = await req.json();
    
    if (!artifactId || slideIndex === undefined || !storagePath) {
      return new Response(JSON.stringify({ error: { message: "invalid payload" } }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Create Supabase client with anon key (allows authenticated access)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    
    // Create slide without org requirement
    const payload = { 
      org_id: "550e8400-e29b-41d4-a716-446655440001", // Use the test org from seed data
      artifact_id: artifactId, 
      slide_index: slideIndex, 
      storage_path: storagePath, // Use storage_path as per actual schema
      width_px: width ?? null, 
      height_px: height ?? null
    };
    
    const { data, error } = await supabase.from("slides").upsert(payload, { 
      onConflict: "artifact_id,slide_index" 
    }).select("id").single();
    
    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ error: { message: error.message } }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log('✅ Slide committed successfully:', data.id);
    return new Response(JSON.stringify({ id: data.id }), { 
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*'
      } 
    });
    
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: { message: error.message } }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});