import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface UniversalIntelligence {
  entity_type: 'company' | 'contact' | 'interaction' | 'opportunity' | 'file';
  entity_id: string;
  intelligence_type: string;
  insights: any;
  confidence_score: number;
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

    const { 
      entity_type, 
      entity_id, 
      intelligence_type = 'comprehensive',
      analysis_depth = 'standard' // 'quick', 'standard', 'deep'
    } = await req.json()

    if (!entity_type || !entity_id) {
      return new Response(
        JSON.stringify({ error: 'entity_type and entity_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Generating ${intelligence_type} intelligence for ${entity_type}: ${entity_id}`)

    // Get entity data based on type
    const entityData = await getEntityData(supabaseClient, entity_type, entity_id)
    
    if (!entityData) {
      return new Response(
        JSON.stringify({ error: `${entity_type} not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate intelligence using GPT-5
    const intelligence = await generateUniversalIntelligence(entity_type, entityData, intelligence_type, analysis_depth)

    // Store intelligence
    await storeUniversalIntelligence(supabaseClient, entity_type, entity_id, intelligence)

    return new Response(
      JSON.stringify({ 
        ok: true, 
        entity_type,
        entity_id,
        intelligence_type,
        intelligence,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error generating universal intelligence:', error)
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

async function getEntityData(supabaseClient: any, entityType: string, entityId: string) {
  switch (entityType) {
    case 'company':
      return await getCompanyData(supabaseClient, entityId)
    case 'contact':
      return await getContactData(supabaseClient, entityId)
    case 'interaction':
      return await getInteractionData(supabaseClient, entityId)
    case 'opportunity':
      return await getOpportunityData(supabaseClient, entityId)
    case 'file':
      return await getFileData(supabaseClient, entityId)
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

async function getCompanyData(supabaseClient: any, companyId: string) {
  // First get the basic company data
  const { data: company, error: companyError } = await supabaseClient
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (companyError) {
    console.error('Error fetching company data:', companyError)
    return null
  }

  // Then get related data separately to avoid join issues
  const { data: contacts } = await supabaseClient
    .from('contacts')
    .select('id, name, title, email, last_interaction_at')
    .eq('company_id', companyId)

  const { data: interactions } = await supabaseClient
    .from('interactions')
    .select('id, interaction_type, subject, content_preview, started_at, participants')
    .eq('company_id', companyId)

  const { data: opportunities } = await supabaseClient
    .from('opportunities')
    .select('id, name, stage, value, close_date')
    .eq('company_id', companyId)

  return {
    ...company,
    contacts: contacts || [],
    interactions: interactions || [],
    opportunities: opportunities || []
  }
}

async function getContactData(supabaseClient: any, contactId: string) {
  const { data: contact } = await supabaseClient
    .from('contacts')
    .select(`
      *,
      companies!inner(*),
      interactions(id, interaction_type, subject, content_preview, started_at, participants),
      relationships(from_contact, to_contact, strength, relationship_type)
    `)
    .eq('id', contactId)
    .single()

  return contact
}

async function getInteractionData(supabaseClient: any, interactionId: string) {
  const { data: interaction } = await supabaseClient
    .from('interactions')
    .select(`
      *,
      companies(*),
      contacts!contacts_participants_fkey(*)
    `)
    .eq('id', interactionId)
    .single()

  return interaction
}

async function getOpportunityData(supabaseClient: any, opportunityId: string) {
  const { data: opportunity } = await supabaseClient
    .from('opportunities')
    .select(`
      *,
      companies(*),
      contacts(*),
      interactions(id, interaction_type, subject, content_preview, started_at)
    `)
    .eq('id', opportunityId)
    .single()

  return opportunity
}

async function getFileData(supabaseClient: any, fileId: string) {
  const { data: file } = await supabaseClient
    .from('artifacts')
    .select(`
      *,
      companies(*),
      contacts(*),
      slides(*)
    `)
    .eq('id', fileId)
    .single()

  return file
}

async function generateUniversalIntelligence(
  entityType: string, 
  entityData: any, 
  intelligenceType: string,
  analysisDepth: string
) {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  // Use GPT-4 models (GPT-5 requires proper API key setup)
  const model = analysisDepth === 'deep' ? 'gpt-4-turbo' : 
                analysisDepth === 'standard' ? 'gpt-4' : 'gpt-3.5-turbo'

  const prompt = buildIntelligencePrompt(entityType, entityData, intelligenceType, analysisDepth)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: `You are an expert business intelligence analyst with deep expertise in relationship mapping, market analysis, and strategic insights. Analyze the provided data and generate actionable intelligence in the exact JSON format requested.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: analysisDepth === 'deep' ? 2000 : analysisDepth === 'standard' ? 1000 : 500
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
    intelligence.last_updated = new Date().toISOString()
    
    return intelligence
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content)
    console.error('Parse error:', parseError)
    
    // Return fallback intelligence based on entity type
    return generateFallbackIntelligence(entityType, entityData)
  }
}

function buildIntelligencePrompt(entityType: string, entityData: any, intelligenceType: string, analysisDepth: string) {
  const basePrompt = `Analyze this ${entityType} and generate ${intelligenceType} intelligence insights.`

  switch (entityType) {
    case 'company':
      return `${basePrompt}

Company: ${entityData.name} (${entityData.domain})
Industry: ${entityData.industry || 'Unknown'}
Employees: ${entityData.employees || 'Unknown'}
Funding Stage: ${entityData.funding_stage || 'Unknown'}

Recent Interactions: ${entityData.interactions?.length || 0}
Key Contacts: ${entityData.contacts?.length || 0}
Active Opportunities: ${entityData.opportunities?.length || 0}

Provide JSON response with:
{
  "context": "string",
  "risk_factors": ["string"],
  "opportunities": ["string"],
  "next_best_actions": ["string"],
  "relationship_strength": 0.0-1.0
}`

    case 'contact':
      return `${basePrompt}

Contact: ${entityData.name} (${entityData.email})
Title: ${entityData.title}
Company: ${entityData.companies?.name}
Recent Interactions: ${entityData.interactions?.length || 0}
Relationships: ${entityData.relationships?.length || 0}

Provide JSON response with:
{
  "context": "string",
  "risk_factors": ["string"],
  "opportunities": ["string"],
  "next_best_actions": ["string"],
  "relationship_strength": 0.0-1.0
}`

    case 'interaction':
      return `${basePrompt}

Interaction: ${entityData.interaction_type}
Subject: ${entityData.subject}
Content: ${entityData.content_preview}
Participants: ${entityData.participants?.length || 0}
Date: ${entityData.started_at}

Provide JSON response with:
{
  "sentiment": "positive/neutral/negative",
  "key_topics": ["string"],
  "action_items": ["string"],
  "relationship_impact": "positive/neutral/negative",
  "follow_up_required": true/false,
  "urgency": "high/medium/low",
  "next_steps": ["string"],
  "confidence_score": 0.0-1.0
}`

    case 'opportunity':
      return `${basePrompt}

Opportunity: ${entityData.name}
Stage: ${entityData.stage}
Value: $${entityData.value}
Close Date: ${entityData.close_date}
Company: ${entityData.companies?.name}

Provide JSON response with:
{
  "probability": 0.0-1.0,
  "risk_assessment": "low/medium/high",
  "key_stakeholders": ["string"],
  "decision_factors": ["string"],
  "competitive_threats": ["string"],
  "next_milestone": "string",
  "recommended_actions": ["string"],
  "confidence_score": 0.0-1.0
}`

    case 'file':
      return `${basePrompt}

File: ${entityData.title}
Type: ${entityData.kind}
Size: ${entityData.file_size}
Company: ${entityData.companies?.name}
Content: ${entityData.slides?.map(s => s.text_content).join(' ') || 'No content available'}

Provide JSON response with:
{
  "content_summary": "string",
  "key_insights": ["string"],
  "entities_mentioned": ["string"],
  "topics": ["string"],
  "action_items": ["string"],
  "relevance_score": 0.0-1.0,
  "next_best_action": "string",
  "confidence_score": 0.0-1.0
}`

    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

function generateFallbackIntelligence(entityType: string, entityData: any) {
  const baseIntelligence = {
    last_updated: new Date().toISOString(),
    confidence_score: 0.3
  }

  switch (entityType) {
    case 'company':
      return {
        ...baseIntelligence,
        market_position: "Unknown - needs assessment",
        growth_stage: "Unknown",
        strategic_fit: 0.5,
        decision_makers: [],
        competitive_landscape: [],
        partnership_potential: "medium",
        funding_intelligence: "Unknown",
        next_best_action: "Schedule discovery call to assess fit"
      }
    
    case 'contact':
      return {
        ...baseIntelligence,
        relationship_strength: 0.5,
        influence_score: 0.5,
        context: "Contact with limited interaction history",
        opportunities: ["Schedule initial meeting"],
        risk_factors: ["Limited interaction history"],
        communication_preferences: "Email",
        decision_making_style: "Unknown",
        optimal_outreach_timing: "Standard business hours",
        next_best_action: "Reach out to schedule discovery call"
      }
    
    case 'interaction':
      return {
        ...baseIntelligence,
        sentiment: "neutral",
        key_topics: [],
        action_items: [],
        relationship_impact: "neutral",
        follow_up_required: false,
        urgency: "low",
        next_steps: ["Review and assess"],
        confidence_score: 0.3
      }
    
    case 'opportunity':
      return {
        ...baseIntelligence,
        probability: 0.5,
        risk_assessment: "medium",
        key_stakeholders: [],
        decision_factors: [],
        competitive_threats: [],
        next_milestone: "Unknown",
        recommended_actions: ["Schedule stakeholder meeting"],
        confidence_score: 0.3
      }
    
    case 'file':
      return {
        ...baseIntelligence,
        content_summary: "Document requires analysis",
        key_insights: [],
        entities_mentioned: [],
        topics: [],
        action_items: [],
        relevance_score: 0.5,
        next_best_action: "Review document content",
        confidence_score: 0.3
      }
    
    default:
      return baseIntelligence
  }
}

async function storeUniversalIntelligence(supabaseClient: any, entityType: string, entityId: string, intelligence: any) {
  const { error } = await supabaseClient
    .from('universal_intelligence')
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      intelligence_type: 'comprehensive',
      insights: intelligence,
      confidence_score: intelligence.confidence_score || 0.5,
      last_updated: intelligence.last_updated
    }, {
      onConflict: 'entity_type,entity_id'
    })

  if (error) {
    console.error('Error storing universal intelligence:', error)
  }
}
