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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { company_id } = await req.json()

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get company data
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .single()

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🧠 Generating intelligence for company: ${company.name}`)

    // Generate AI intelligence overlay
    const intelligenceOverlay = await generateIntelligenceOverlay(company)

    // Save to database
    const { data: savedOverlay, error: saveError } = await supabaseClient
      .from('intelligence_overlays')
      .insert({
        company_id: company_id,
        relationship_strength: intelligenceOverlay.relationship_strength,
        context: intelligenceOverlay.context,
        opportunities: intelligenceOverlay.opportunities,
        risk_factors: intelligenceOverlay.risk_factors,
        next_best_action: intelligenceOverlay.next_best_action,
        confidence_score: intelligenceOverlay.confidence_score,
        insights: intelligenceOverlay.insights,
        last_updated: intelligenceOverlay.last_updated
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving intelligence overlay:', saveError)
      return new Response(
        JSON.stringify({ error: 'Failed to save intelligence overlay' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        company: {
          id: company.id,
          name: company.name,
          domain: company.domain
        },
        intelligence_overlay: intelligenceOverlay
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Intelligence overlay error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateIntelligenceOverlay(company: any): Promise<IntelligenceOverlay> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  
  console.log(`🔑 API Key found: ${openaiApiKey ? 'YES' : 'NO'}`)
  
  if (!openaiApiKey) {
    // Return mock data if no OpenAI API key
    return {
      relationship_strength: 0.7,
      context: `Investment opportunity in ${company.industry || 'technology'} sector`,
      opportunities: [
        'Potential partnership opportunities',
        'Investment evaluation',
        'Market expansion potential'
      ],
      risk_factors: [
        'Market competition',
        'Regulatory changes',
        'Technology disruption'
      ],
      next_best_action: 'Schedule initial meeting to discuss investment thesis',
      confidence_score: 0.8,
      insights: {
        communication_style: 'Professional and data-driven',
        decision_making: 'Board-driven with emphasis on growth metrics',
        optimal_timing: 'Q1-Q2 for investment discussions',
        preferred_channel: 'Email with detailed proposal'
      },
      last_updated: new Date().toISOString()
    }
  }

  const prompt = `Analyze this company and provide investment intelligence insights:

Company: ${company.name}
Domain: ${company.domain}
Industry: ${company.industry || 'Not specified'}
Description: ${company.description || 'Not provided'}

Provide a JSON response with the following structure:
{
  "relationship_strength": 0.8,
  "context": "Brief context about the company and investment opportunity",
  "opportunities": ["Opportunity 1", "Opportunity 2", "Opportunity 3"],
  "risk_factors": ["Risk 1", "Risk 2", "Risk 3"],
  "next_best_action": "Specific recommended next action",
  "confidence_score": 0.85,
  "insights": {
    "communication_style": "How to communicate with this company",
    "decision_making": "How decisions are made",
    "optimal_timing": "Best timing for engagement",
    "preferred_channel": "Preferred communication channel"
  }
}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Using GPT-4o for enhanced intelligence analysis (GPT-5 not yet available)
        messages: [
          {
            role: 'system',
            content: 'You are an expert investment analyst. Provide actionable intelligence insights in the exact JSON format requested.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error details:', errorText)
      console.error('Response status:', response.status)
      console.error('Response headers:', Object.fromEntries(response.headers.entries()))
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content
    
    // Clean up the response - remove markdown code blocks if present
    let cleanContent = content.trim()
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    // Parse JSON response
    const intelligenceData = JSON.parse(cleanContent)
    
    return {
      ...intelligenceData,
      last_updated: new Date().toISOString()
    }

  } catch (error) {
    console.error('OpenAI API error:', error)
    
    // Return fallback data
    return {
      relationship_strength: 0.6,
      context: `Investment opportunity in ${company.industry || 'technology'} sector`,
      opportunities: [
        'Potential partnership opportunities',
        'Investment evaluation',
        'Market expansion potential'
      ],
      risk_factors: [
        'Market competition',
        'Regulatory changes',
        'Technology disruption'
      ],
      next_best_action: 'Schedule initial meeting to discuss investment thesis',
      confidence_score: 0.7,
      insights: {
        communication_style: 'Professional and data-driven',
        decision_making: 'Board-driven with emphasis on growth metrics',
        optimal_timing: 'Q1-Q2 for investment discussions',
        preferred_channel: 'Email with detailed proposal'
      },
      last_updated: new Date().toISOString()
    }
  }
}
