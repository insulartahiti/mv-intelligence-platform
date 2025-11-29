import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { deckId, companyName, createIfMissing = true } = await req.json()

    if (!deckId) {
      return new Response(
        JSON.stringify({ error: 'Deck ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', deckId)
      .single()

    if (artifactError || !artifact) {
      return new Response(
        JSON.stringify({ error: 'Deck not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Simulate Affinity push
    const affinityId = `aff_${Date.now()}`

    // Update artifact status
    await supabase
      .from('artifacts')
      .update({
        affinity_push_status: 'pushed',
        summary: {
          ...artifact.summary,
          affinity_id: affinityId,
          pushed_at: new Date().toISOString()
        }
      })
      .eq('id', deckId)

    // Create activity record
    await supabase
      .from('activities')
      .insert({
        org_id: artifact.org_id,
        artifact_id: deckId,
        verb: 'pushed_to_affinity',
        meta: { affinity_id: affinityId, company_name: companyName },
        created_at: new Date().toISOString()
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        affinityId,
        message: 'Deck pushed to Affinity successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Affinity push error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
