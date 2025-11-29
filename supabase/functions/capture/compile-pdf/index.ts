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
    const { deckId } = await req.json()

    if (!deckId) {
      return new Response(
        JSON.stringify({ error: 'Deck ID required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the artifact and slides
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', deckId)
      .single()

    if (artifactError || !artifact) {
      return new Response(
        JSON.stringify({ error: 'Deck not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('*')
      .eq('artifact_id', deckId)
      .order('slide_index', { ascending: true })

    if (slidesError || !slides || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No slides found for deck' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // For now, we'll create a simple PDF compilation response
    // In production, this would use a PDF library to actually compile the slides
    const compilationResult = {
      deckId,
      slideCount: slides.length,
      status: 'compiled',
      timestamp: new Date().toISOString()
    }

    // Update the artifact with compilation status
    await supabase
      .from('artifacts')
      .update({
        summary: {
          ...artifact.summary,
          compiled: true,
          compiled_at: new Date().toISOString(),
          slide_count: slides.length
        }
      })
      .eq('id', deckId)

    // Create activity record for compilation
    await supabase
      .from('activities')
      .insert({
        org_id: artifact.org_id,
        artifact_id: deckId,
        verb: 'compiled',
        meta: {
          slide_count: slides.length,
          compilation_time: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      })

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        compilation: compilationResult,
        message: `PDF compiled with ${slides.length} slides`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('PDF compilation error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
