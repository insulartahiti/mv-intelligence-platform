import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get request body
    const { slides, metadata } = await req.json()

    if (!slides || !Array.isArray(slides)) {
      return new Response(
        JSON.stringify({ error: 'Invalid slides data' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract org_id from JWT (in production, validate the token)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // For now, use a default org_id (in production, extract from JWT)
    const orgId = '550e8400-e29b-41d4-a716-446655440001'

    // Create artifact record
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .insert({
        org_id: orgId,
        kind: 'deck',
        title: metadata?.title || 'Captured Deck',
        source_url: slides[0]?.url || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (artifactError) {
      console.error('Artifact creation error:', artifactError)
      return new Response(
        JSON.stringify({ error: 'Failed to create artifact' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create slides records
    const slidesData = slides.map((slide: any, index: number) => ({
      org_id: orgId,
      artifact_id: artifact.id,
      slide_index: index,
      image_url: slide.screenshot || null,
      width_px: slide.width_px || 1920,
      height_px: slide.height_px || 1080,
      ocr_text: slide.ocr_text || '',
      created_at: new Date().toISOString()
    }))

    const { data: slidesResult, error: slidesError } = await supabase
      .from('slides')
      .insert(slidesData)
      .select()

    if (slidesError) {
      console.error('Slides creation error:', slidesError)
      return new Response(
        JSON.stringify({ error: 'Failed to create slides' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create activity record
    await supabase
      .from('activities')
      .insert({
        org_id: orgId,
        artifact_id: artifact.id,
        verb: 'captured',
        meta: {
          slide_count: slides.length,
          source: metadata?.source || 'chrome-extension',
          company_name: metadata?.companyName
        },
        created_at: new Date().toISOString()
      })

    // Return success response
    const deck = {
      id: artifact.id,
      title: artifact.title,
      slides: slidesResult,
      metadata: {
        ...metadata,
        slideCount: slides.length,
        created_at: artifact.created_at
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        deck,
        message: `Deck created with ${slides.length} slides`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Create deck error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
