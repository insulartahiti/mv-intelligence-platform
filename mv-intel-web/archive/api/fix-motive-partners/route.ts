import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    
    if (!company_id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Get company data
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Generate correct intelligence for Motive Partners
    const prompt = `Analyze this company and provide accurate investment intelligence:

Company: ${company.name}
Domain: ${company.domain || 'N/A'}
Industry: ${company.industry || 'N/A'}
Description: ${company.description || 'N/A'}

IMPORTANT: If this is Motive Partners (motivepartners.com), they are a well-established private equity firm focused on financial technology investments, NOT a 2021 technology startup. They are a leading fintech-focused private equity firm with a strong track record.

Provide comprehensive intelligence in JSON format:
{
  "context": "Accurate context about the company and its business",
  "opportunities": [
    "Specific opportunities based on accurate company information",
    "Real business development opportunities",
    "Actual partnership potential"
  ],
  "risk_factors": [
    "Real risks and concerns",
    "Actual business challenges"
  ],
  "next_best_action": "Specific actionable next step based on accurate information",
  "confidence_score": 0.85,
  "insights": {
    "communication_style": "How to communicate with this company",
    "decision_making": "How decisions are made",
    "optimal_timing": "Best timing for engagement",
    "preferred_channel": "Preferred communication channel"
  }
}

Return only valid JSON without markdown formatting.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert investment analyst. Provide accurate, factual intelligence based on real company information. Do not make up or guess company details.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const intelligence = JSON.parse(data.choices[0].message.content);

    // Update the intelligence in the database
    const { error: updateError } = await supabase
      .from('intelligence_overlays')
      .upsert({
        company_id: company_id,
        context: intelligence.context,
        opportunities: intelligence.opportunities,
        risk_factors: intelligence.risk_factors,
        next_best_action: intelligence.next_best_action,
        confidence_score: intelligence.confidence_score,
        insights: intelligence.insights,
        enrichment_sources: ['gpt4o_corrected'],
        last_updated: new Date().toISOString()
      });

    if (updateError) {
      throw new Error(`Database update error: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Intelligence updated with accurate information',
      company_id,
      intelligence
    });

  } catch (error) {
    console.error('Error fixing company intelligence:', error);
    return NextResponse.json(
      { error: 'Failed to fix intelligence', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}



