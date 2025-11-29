import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface IntelligenceOverlay {
  relationship_strength: number;
  context: string;
  opportunities: string[];
  risk_factors: string[];
  next_best_action: string;
  confidence_score: number;
  insights: {
    communication_style: string;
    decision_making: string;
    optimal_timing: string;
    preferred_channel: string;
  };
  last_updated: string;
}

interface ContactData {
  id: string;
  name: string;
  email: string;
  company_id: string;
  company_name: string;
  interactions: any[];
  opportunities: any[];
  relationships: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      'http://127.0.0.1:54321', // Force local Supabase for development
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU' // Local service role key
    )

    const { contact_id, company_id, update_type = 'full' } = await req.json()

    if (!contact_id && !company_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id or company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get contact and company data
    const contactData = await getContactData(supabaseClient, contact_id, company_id)
    
    if (!contactData) {
      return new Response(
        JSON.stringify({ error: 'Contact or company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate intelligence overlay using GPT-4o
    const intelligence = await generateIntelligenceOverlay(contactData)

    // Store or update intelligence overlay
    await storeIntelligenceOverlay(supabaseClient, contactData.id, intelligence)

    return new Response(
      JSON.stringify({ 
        ok: true, 
        intelligence,
        contact_id: contactData.id,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error generating intelligence overlay:', error)
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

async function getContactData(supabaseClient: any, contactId?: string, companyId?: string): Promise<ContactData | null> {
  let query = supabaseClient
    .from('contacts')
    .select(`
      id, name, email, company_id,
      companies!inner(name)
    `)

  if (contactId) {
    query = query.eq('id', contactId)
  } else if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data: contacts, error } = await query.limit(1)

  if (error || !contacts || contacts.length === 0) {
    return null
  }

  const contact = contacts[0]

  // Get interactions
  const { data: interactions } = await supabaseClient
    .from('interactions')
    .select('*')
    .or(`contact_id.eq.${contact.id},company_id.eq.${contact.company_id}`)
    .order('created_at', { ascending: false })
    .limit(50)

  // Get opportunities
  const { data: opportunities } = await supabaseClient
    .from('opportunities')
    .select('*')
    .eq('company_id', contact.company_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Get relationships
  const { data: relationships } = await supabaseClient
    .from('relationships')
    .select('*')
    .or(`source_id.eq.${contact.id},target_id.eq.${contact.id}`)

  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    company_id: contact.company_id,
    company_name: contact.companies.name,
    interactions: interactions || [],
    opportunities: opportunities || [],
    relationships: relationships || []
  }
}

async function generateIntelligenceOverlay(contactData: ContactData): Promise<IntelligenceOverlay> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  // Prepare context for GPT-4o
  const context = {
    contact: {
      name: contactData.name,
      email: contactData.email,
      company: contactData.company_name
    },
    interactions: contactData.interactions.map(i => ({
      type: i.type,
      date: i.created_at,
      summary: i.summary,
      sentiment: i.sentiment
    })),
    opportunities: contactData.opportunities.map(o => ({
      name: o.name,
      stage: o.stage,
      value: o.value,
      created_at: o.created_at
    })),
    relationships: contactData.relationships.map(r => ({
      type: r.relationship_type,
      strength: r.strength,
      target: r.target_id
    }))
  }

  const prompt = `
Analyze this contact and their relationship with our company to create an intelligence overlay.

Contact: ${context.contact.name} (${context.contact.email}) at ${context.contact.company}

Recent Interactions (${context.interactions.length} total):
${context.interactions.slice(0, 10).map(i => `- ${i.type} on ${i.date}: ${i.summary} (sentiment: ${i.sentiment})`).join('\n')}

Opportunities (${context.opportunities.length} total):
${context.opportunities.map(o => `- ${o.name}: ${o.stage} ($${o.value})`).join('\n')}

Relationships (${context.relationships.length} total):
${context.relationships.map(r => `- ${r.type} (strength: ${r.strength})`).join('\n')}

Please provide a JSON response with the following structure:
{
  "relationship_strength": 0.85, // 0-1 score based on interaction frequency, quality, recency
  "context": "Former colleague who is now VP of Sales at target company",
  "opportunities": [
    "Warm intro to CEO for partnership discussion",
    "Customer reference for similar enterprise deals"
  ],
  "risk_factors": [
    "Competing priorities with current role"
  ],
  "next_best_action": "Schedule 30-min coffee meeting to discuss partnership opportunities",
  "confidence_score": 0.92, // How confident we are in this assessment
  "insights": {
    "communication_style": "Direct and results-oriented",
    "decision_making": "Data-driven with emphasis on ROI",
    "optimal_timing": "Tuesday-Thursday, 10am-2pm",
    "preferred_channel": "Email with calendar link"
  }
}

Consider:
- Interaction frequency and recency
- Quality of interactions (positive/negative sentiment)
- Business outcomes (deals, partnerships)
- Personal rapport indicators
- Network effects and mutual connections
- Company context and market position
- Communication patterns and preferences
`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert relationship intelligence analyst. Analyze contact data and provide actionable insights in the exact JSON format requested.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 1,
      max_completion_tokens: 1000,
      // GPT-5 specific parameters
      verbosity: 'medium',
      reasoning_effort: 'medium'
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No response from OpenAI')
  }

  try {
    // Clean the response - remove markdown code blocks if present
    let cleanContent = content.trim()
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const intelligence = JSON.parse(cleanContent)
    
    // Add timestamp
    intelligence.last_updated = new Date().toISOString()
    
    // Validate required fields
    if (!intelligence.relationship_strength || !intelligence.context || !intelligence.next_best_action) {
      throw new Error('Invalid intelligence overlay structure')
    }

    return intelligence
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content)
    console.error('Parse error:', parseError)
    
    // Return a fallback intelligence overlay
    return {
      relationship_strength: 0.5,
      context: "Contact with limited interaction history",
      opportunities: ["Schedule initial meeting to build relationship"],
      risk_factors: ["Limited interaction history"],
      next_best_action: "Reach out to schedule a discovery call",
      confidence_score: 0.3,
      insights: {
        communication_style: "Unknown - needs assessment",
        decision_making: "Unknown - needs assessment", 
        optimal_timing: "Standard business hours",
        preferred_channel: "Email"
      },
      last_updated: new Date().toISOString()
    }
  }
}

async function storeIntelligenceOverlay(supabaseClient: any, contactId: string, intelligence: IntelligenceOverlay) {
  // Store in a new intelligence_overlays table
  const { error } = await supabaseClient
    .from('intelligence_overlays')
    .upsert({
      contact_id: contactId,
      relationship_strength: intelligence.relationship_strength,
      context: intelligence.context,
      opportunities: intelligence.opportunities,
      risk_factors: intelligence.risk_factors,
      next_best_action: intelligence.next_best_action,
      confidence_score: intelligence.confidence_score,
      insights: intelligence.insights,
      last_updated: intelligence.last_updated
    }, {
      onConflict: 'contact_id'
    })

  if (error) {
    console.error('Error storing intelligence overlay:', error)
    // Don't throw - this is not critical for the response
  }
}
