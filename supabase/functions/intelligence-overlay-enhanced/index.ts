import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface EnhancedIntelligenceOverlay {
  // Core Intelligence
  relationship_strength: number;
  context: string;
  opportunities: string[];
  risk_factors: string[];
  next_best_action: string;
  confidence_score: number;
  
  // Enhanced Insights
  insights: {
    communication_style: string;
    decision_making: string;
    optimal_timing: string;
    preferred_channel: string;
  };
  
  // RAG-Ready Data
  company_profile: {
    business_model: string;
    key_metrics: string[];
    competitive_advantages: string[];
    market_position: string;
    growth_trajectory: string;
  };
  
  // Introduction Intelligence
  intro_opportunities: {
    warm_intros: string[];
    mutual_connections: string[];
    conversation_starters: string[];
    value_propositions: string[];
  };
  
  // Investment Intelligence
  investment_thesis: {
    investment_highlights: string[];
    key_risks: string[];
    due_diligence_focus: string[];
    valuation_considerations: string[];
  };
  
  // Market Intelligence
  market_context: {
    industry_trends: string[];
    market_size: string;
    growth_drivers: string[];
    competitive_landscape: string;
  };
  
  // Relationship Intelligence
  relationship_mapping: {
    key_stakeholders: string[];
    decision_makers: string[];
    influencers: string[];
    relationship_history: string;
  };
  
  last_updated: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      'http://host.docker.internal:54321', // Use host.docker.internal for Docker containers
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU' // Local service role key
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

    console.log(`🧠 Generating enhanced intelligence for company: ${company.name}`)

    // Generate enhanced AI intelligence overlay
    const intelligenceOverlay = await generateEnhancedIntelligenceOverlay(company)

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
    console.error('Enhanced intelligence overlay error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateEnhancedIntelligenceOverlay(company: any): Promise<EnhancedIntelligenceOverlay> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  
  if (!openaiApiKey) {
    // Return enhanced mock data if no OpenAI API key
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
      company_profile: {
        business_model: 'Technology-driven solutions',
        key_metrics: ['Revenue growth', 'Customer acquisition', 'Market share'],
        competitive_advantages: ['Technology innovation', 'Market expertise'],
        market_position: 'Emerging leader',
        growth_trajectory: 'High growth potential'
      },
      intro_opportunities: {
        warm_intros: ['Industry contacts', 'Previous investors'],
        mutual_connections: ['LinkedIn connections', 'Industry events'],
        conversation_starters: ['Market trends', 'Technology innovation'],
        value_propositions: ['Strategic partnership', 'Investment opportunity']
      },
      investment_thesis: {
        investment_highlights: ['Strong market position', 'Innovative technology'],
        key_risks: ['Market volatility', 'Competition'],
        due_diligence_focus: ['Financial performance', 'Market validation'],
        valuation_considerations: ['Growth potential', 'Market size']
      },
      market_context: {
        industry_trends: ['Digital transformation', 'AI adoption'],
        market_size: 'Large and growing',
        growth_drivers: ['Technology adoption', 'Market demand'],
        competitive_landscape: 'Moderately competitive'
      },
      relationship_mapping: {
        key_stakeholders: ['CEO', 'CTO', 'CFO'],
        decision_makers: ['Board of Directors'],
        influencers: ['Industry advisors'],
        relationship_history: 'New relationship'
      },
      last_updated: new Date().toISOString()
    }
  }

  const prompt = `Analyze this company and provide comprehensive investment intelligence for RAG, introductions, and insights:

Company: ${company.name}
Domain: ${company.domain}
Industry: ${company.industry || 'Not specified'}
Description: ${company.description || 'Not provided'}

Provide a comprehensive JSON response with the following structure:
{
  "relationship_strength": 0.8,
  "context": "Detailed context about the company and investment opportunity",
  "opportunities": ["Opportunity 1", "Opportunity 2", "Opportunity 3"],
  "risk_factors": ["Risk 1", "Risk 2", "Risk 3"],
  "next_best_action": "Specific recommended next action",
  "confidence_score": 0.85,
  "insights": {
    "communication_style": "How to communicate with this company",
    "decision_making": "How decisions are made",
    "optimal_timing": "Best timing for engagement",
    "preferred_channel": "Preferred communication channel"
  },
  "company_profile": {
    "business_model": "Description of how the company makes money",
    "key_metrics": ["Metric 1", "Metric 2", "Metric 3"],
    "competitive_advantages": ["Advantage 1", "Advantage 2"],
    "market_position": "Company's position in the market",
    "growth_trajectory": "Growth potential and trajectory"
  },
  "intro_opportunities": {
    "warm_intros": ["Potential warm introduction sources"],
    "mutual_connections": ["Types of mutual connections"],
    "conversation_starters": ["Topics to start conversations"],
    "value_propositions": ["Value props for this company"]
  },
  "investment_thesis": {
    "investment_highlights": ["Key investment highlights"],
    "key_risks": ["Main investment risks"],
    "due_diligence_focus": ["Areas to focus due diligence"],
    "valuation_considerations": ["Valuation factors to consider"]
  },
  "market_context": {
    "industry_trends": ["Current industry trends"],
    "market_size": "Market size and opportunity",
    "growth_drivers": ["Key growth drivers"],
    "competitive_landscape": "Competitive environment"
  },
  "relationship_mapping": {
    "key_stakeholders": ["Key people to know"],
    "decision_makers": ["Who makes decisions"],
    "influencers": ["Key influencers"],
    "relationship_history": "Relationship context"
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
        model: 'gpt-5-chat-latest', // Using GPT-5 for enhanced comprehensive intelligence analysis
        messages: [
          {
            role: 'system',
            content: 'You are an expert investment analyst and relationship intelligence specialist. Provide comprehensive, actionable intelligence for RAG systems, introductions, and investment insights in the exact JSON format requested.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 2000
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
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
    
    // Return enhanced fallback data
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
      company_profile: {
        business_model: 'Technology-driven solutions',
        key_metrics: ['Revenue growth', 'Customer acquisition', 'Market share'],
        competitive_advantages: ['Technology innovation', 'Market expertise'],
        market_position: 'Emerging leader',
        growth_trajectory: 'High growth potential'
      },
      intro_opportunities: {
        warm_intros: ['Industry contacts', 'Previous investors'],
        mutual_connections: ['LinkedIn connections', 'Industry events'],
        conversation_starters: ['Market trends', 'Technology innovation'],
        value_propositions: ['Strategic partnership', 'Investment opportunity']
      },
      investment_thesis: {
        investment_highlights: ['Strong market position', 'Innovative technology'],
        key_risks: ['Market volatility', 'Competition'],
        due_diligence_focus: ['Financial performance', 'Market validation'],
        valuation_considerations: ['Growth potential', 'Market size']
      },
      market_context: {
        industry_trends: ['Digital transformation', 'AI adoption'],
        market_size: 'Large and growing',
        growth_drivers: ['Technology adoption', 'Market demand'],
        competitive_landscape: 'Moderately competitive'
      },
      relationship_mapping: {
        key_stakeholders: ['CEO', 'CTO', 'CFO'],
        decision_makers: ['Board of Directors'],
        influencers: ['Industry advisors'],
        relationship_history: 'New relationship'
      },
      last_updated: new Date().toISOString()
    }
  }
}
