import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface BatchUpdateResult {
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
  results: Array<{
    contact_id: string;
    success: boolean;
    error?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { 
      update_type = 'all', // 'all', 'stale', 'high_priority'
      limit = 50,
      contact_ids = null 
    } = await req.json()

    console.log(`Starting batch intelligence update: ${update_type}, limit: ${limit}`)

    // Get contacts to update
    const contactsToUpdate = await getContactsToUpdate(supabaseClient, update_type, limit, contact_ids)
    
    if (contactsToUpdate.length === 0) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: 'No contacts need intelligence updates',
          processed: 0,
          successful: 0,
          failed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${contactsToUpdate.length} contacts to update`)

    // Process contacts in batches to avoid rate limits
    const batchSize = 5
    const results: BatchUpdateResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      results: []
    }

    for (let i = 0; i < contactsToUpdate.length; i += batchSize) {
      const batch = contactsToUpdate.slice(i, i + batchSize)
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contactsToUpdate.length / batchSize)}`)
      
      // Process batch in parallel
      const batchPromises = batch.map(async (contact) => {
        try {
          // Call the intelligence-overlay function
          const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/intelligence-overlay`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
              'x-mv-signature': Deno.env.get('MV_WEBHOOK_SECRET') || ''
            },
            body: JSON.stringify({
              contact_id: contact.id,
              update_type: 'batch'
            })
          })

          const result = await response.json()
          
          if (result.ok) {
            results.successful++
            return { contact_id: contact.id, success: true }
          } else {
            results.failed++
            results.errors.push(`Contact ${contact.id}: ${result.error}`)
            return { contact_id: contact.id, success: false, error: result.error }
          }
        } catch (error) {
          results.failed++
          const errorMsg = `Contact ${contact.id}: ${error.message}`
          results.errors.push(errorMsg)
          return { contact_id: contact.id, success: false, error: error.message }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.results.push(...batchResults)
      results.processed += batch.length

      // Add delay between batches to avoid rate limits
      if (i + batchSize < contactsToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Update last batch run timestamp
    await updateBatchRunTimestamp(supabaseClient)

    return new Response(
      JSON.stringify({ 
        ok: true, 
        ...results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in batch intelligence update:', error)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function getContactsToUpdate(
  supabaseClient: any, 
  updateType: string, 
  limit: number, 
  contactIds?: string[]
): Promise<Array<{id: string, name: string, last_updated?: string}>> {
  
  let query = supabaseClient
    .from('contacts')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (contactIds && contactIds.length > 0) {
    query = query.in('id', contactIds)
  } else {
    switch (updateType) {
      case 'stale':
        // Contacts with no intelligence overlay or stale overlay (>7 days)
        query = query
          .leftJoin('intelligence_overlays', 'contacts.id', 'intelligence_overlays.contact_id')
          .or('intelligence_overlays.contact_id.is.null,intelligence_overlays.last_updated.lt.' + 
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        break
      
      case 'high_priority':
        // Contacts with recent interactions but no recent intelligence update
        query = query
          .leftJoin('intelligence_overlays', 'contacts.id', 'intelligence_overlays.contact_id')
          .leftJoin('interactions', 'contacts.id', 'interactions.contact_id')
          .or('intelligence_overlays.contact_id.is.null,intelligence_overlays.last_updated.lt.interactions.created_at')
          .gte('interactions.created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
        break
      
      case 'all':
      default:
        // All contacts, ordered by creation date
        break
    }
  }

  const { data: contacts, error } = await query.limit(limit)

  if (error) {
    console.error('Error fetching contacts:', error)
    return []
  }

  return contacts || []
}

async function updateBatchRunTimestamp(supabaseClient: any) {
  // Store batch run metadata in a simple table
  const { error } = await supabaseClient
    .from('batch_run_metadata')
    .upsert({
      id: 'intelligence_update',
      last_run: new Date().toISOString(),
      status: 'completed'
    }, {
      onConflict: 'id'
    })

  if (error) {
    console.error('Error updating batch run timestamp:', error)
  }
}
