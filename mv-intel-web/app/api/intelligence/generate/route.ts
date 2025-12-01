import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';



export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
    auth: { persistSession: false } 
  });

  try {
    const { company_id } = await req.json();

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Get company data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    console.log(`🧠 Generating intelligence for company: ${company.name}`);

    // Generate AI intelligence overlay
    const intelligenceOverlay = await generateIntelligenceOverlay(company, OPENAI_API_KEY);

    // Save to database (using existing schema)
    const { data: savedOverlay, error: saveError } = await supabase
      .from('intelligence_overlays')
      .insert({
        company_id: company_id,
        relationship_strength: intelligenceOverlay.relationship_strength,
        context: intelligenceOverlay.context,
        opportunities: intelligenceOverlay.opportunities,
        risk_factors: intelligenceOverlay.risk_factors,
        next_best_action: intelligenceOverlay.next_best_action,
        confidence_score: intelligenceOverlay.confidence_score,
        insights: {
          ...intelligenceOverlay.insights,
          investment_thesis: intelligenceOverlay.investment_thesis,
          market_analysis: intelligenceOverlay.market_analysis,
          due_diligence_priorities: intelligenceOverlay.due_diligence_priorities
        },
        last_updated: intelligenceOverlay.last_updated
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving intelligence overlay:', saveError);
      return NextResponse.json(
        { error: 'Failed to save intelligence overlay' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain
      },
      intelligence_overlay: intelligenceOverlay
    });

  } catch (error) {
    console.error('Intelligence generation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: 'Intelligence generation failed. Please ensure OpenAI API key is configured and try again.'
      },
      { status: 500 }
    );
  }
}


// Interface moved here to be accessible by generateIntelligenceOverlay
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
  investment_thesis?: string;
  market_analysis?: string;
  due_diligence_priorities?: string[];
  last_updated: string;
}

async function generateIntelligenceOverlay(company: any, OPENAI_API_KEY: string): Promise<IntelligenceOverlay> {
  console.log(`🔑 API Key found: ${OPENAI_API_KEY ? 'YES' : 'NO'}`);
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Intelligence generation requires a valid OpenAI API key.');
  }

  const prompt = `You are a senior partner at Motive Ventures, a top-tier fintech VC firm. You've led investments in companies like Stripe, Plaid, Coinbase, and other unicorns. You have deep expertise in fintech, wealth management, and financial services.

COMPANY TO ANALYZE:
- Name: ${company.name}
- Domain: ${company.domain}
- Industry: ${company.industry || 'Not specified'}
- Description: ${company.description || 'Not provided'}
- Tags: ${company.tags ? company.tags.join(', ') : 'None'}

YOUR TASK:
Provide a brutally honest, specific, and actionable investment analysis. Be direct about what you know vs. what you don't know. Use real market data, specific competitor names, and concrete metrics where possible.

REQUIREMENTS:
1. Be SPECIFIC - no generic statements like "potential opportunities"
2. Use REAL data - mention actual competitors, market sizes, regulatory frameworks
3. Be HONEST - if you don't have enough info, say so and specify what's needed
4. Be ACTIONABLE - give concrete next steps with timelines and success metrics
5. Think like a $100M+ fund partner making a real investment decision

RESPONSE FORMAT (JSON only, no markdown):
{
  "relationship_strength": 0.85,
  "context": "Specific analysis based on available data, with clear gaps identified",
  "opportunities": [
    "Concrete opportunity with specific market size and competitive advantage",
    "Specific partnership or expansion opportunity with named companies",
    "Clear revenue or growth opportunity with estimated impact"
  ],
  "risk_factors": [
    "Specific regulatory risk with named regulations and jurisdictions",
    "Concrete competitive threat with named competitors and market share",
    "Clear execution risk with specific challenges and mitigation strategies"
  ],
  "next_best_action": "Specific action with timeline, success metrics, and responsible party",
  "confidence_score": 0.90,
  "insights": {
    "communication_style": "Specific approach based on company stage and culture",
    "decision_making": "How decisions are made based on company structure and stage",
    "optimal_timing": "Specific timing based on company lifecycle and market conditions",
    "preferred_channel": "Recommended channels with specific rationale"
  },
  "investment_thesis": "Clear thesis with specific reasons, market size, and competitive moat",
  "market_analysis": "Specific TAM, named competitors, and growth drivers with data",
  "due_diligence_priorities": ["Specific priority 1", "Specific priority 2", "Specific priority 3"]
}`;

  try {
    console.log('🤖 Making OpenAI API call...');
    console.log('🔑 API Key present:', !!OPENAI_API_KEY);
    console.log('📝 Prompt length:', prompt.length);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Using GPT-4o (most advanced available model)
        messages: [
          {
            role: 'system',
            content: `You are a senior investment analyst at Motive Ventures, a leading fintech-focused venture capital firm. You have 15+ years of experience in fintech investments, having worked at top-tier VCs and led investments in companies like Stripe, Plaid, and Coinbase.

Your expertise includes:
- Deep understanding of fintech market dynamics and trends
- Extensive network in financial services and technology
- Proven track record in Series A-C investments
- Strong analytical skills in unit economics and growth metrics
- Experience with regulatory frameworks in financial services

Provide highly specific, actionable intelligence that demonstrates deep market knowledge and strategic thinking. Focus on concrete opportunities, specific risks, and tactical next steps that align with Motive Ventures' investment thesis and portfolio strategy.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 3000,
        temperature: 0.7
      })
    });

    console.log('📡 OpenAI API response status:', response.status);
    console.log('📡 OpenAI API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error details:', errorText);
      console.error('Response status:', response.status);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📊 OpenAI API response data:', JSON.stringify(data, null, 2));
    
    const content = data.choices[0].message.content;
    console.log('📝 Raw GPT response:', content);
    
    // Clean up the response - remove markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log('🧹 Cleaned content:', cleanContent);
    
    // Parse JSON response
    const intelligenceData = JSON.parse(cleanContent);
    console.log('✅ Parsed intelligence data:', JSON.stringify(intelligenceData, null, 2));
    
    return {
      ...intelligenceData,
      last_updated: new Date().toISOString()
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`Failed to generate intelligence: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
