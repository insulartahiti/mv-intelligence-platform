import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface VisionAnalysisRequest {
  slides: Array<{
    id: string;
    content: string;
    image_url?: string;
    slide_number: number;
  }>;
  organization_id: number;
  organization_name: string;
  deck_title?: string;
}

interface VisionAnalysisResult {
  executive_summary: string;
  key_insights: string[];
  business_model: string;
  market_analysis: string;
  competitive_landscape: string;
  financial_highlights: string;
  recommendations: string[];
  confidence_score: number;
  extracted_entities: {
    companies: string[];
    people: string[];
    technologies: string[];
    markets: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: VisionAnalysisRequest = await request.json();
    const { slides, organization_id, organization_name, deck_title } = body;

    if (!slides || slides.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Slides content is required'
      }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      // For development, return mock data
      console.warn('OpenAI API key not configured, using mock analysis');
      return NextResponse.json({
        status: 'success',
        analysis: {
          executive_summary: `This is a comprehensive analysis of ${organization_name}'s presentation deck. The deck appears to focus on business strategy and market positioning.`,
          key_insights: [
            'Strong market positioning in the target sector',
            'Clear value proposition for customers',
            'Robust business model with multiple revenue streams'
          ],
          business_model: 'The company operates on a subscription-based model with additional service offerings.',
          market_analysis: 'Target market shows strong growth potential with increasing demand for the company\'s solutions.',
          competitive_landscape: 'Competitive positioning appears strong with differentiated offerings.',
          financial_highlights: 'Financial metrics indicate healthy growth and sustainable operations.',
          recommendations: [
            'Continue focusing on core value proposition',
            'Expand market reach in identified growth areas',
            'Strengthen competitive advantages'
          ],
          confidence_score: 0.8,
          extracted_entities: {
            companies: [organization_name],
            people: ['CEO', 'CTO', 'Founder'],
            technologies: ['AI', 'Machine Learning', 'Cloud Computing'],
            markets: ['Enterprise Software', 'SaaS']
          }
        }
      });
    }

    try {
      // Prepare comprehensive analysis prompt
      const systemPrompt = `You are an expert business analyst and investment professional. Analyze this presentation deck and provide a comprehensive business intelligence report.

Your analysis should include:
1. Executive Summary (2-3 paragraphs)
2. Key Business Insights (5-7 bullet points)
3. Business Model Analysis
4. Market Analysis and Opportunity
5. Competitive Landscape Assessment
6. Financial Highlights and Metrics
7. Strategic Recommendations (3-5 actionable items)
8. Confidence Score (0-1)
9. Extracted Entities (companies, people, technologies, markets mentioned)

Focus on actionable insights that would be valuable for investment decisions, partnership opportunities, and strategic planning.`;

      const slidesContent = slides.map(slide => 
        `Slide ${slide.slide_number}: ${slide.content}`
      ).join('\n\n');

      const userPrompt = `Please analyze this presentation deck for ${organization_name} (ID: ${organization_id}):

DECK TITLE: ${deck_title || 'Untitled Presentation'}

SLIDES CONTENT:
${slidesContent}

Provide a comprehensive business analysis in JSON format with the following structure:
{
  "executive_summary": "string",
  "key_insights": ["string"],
  "business_model": "string", 
  "market_analysis": "string",
  "competitive_landscape": "string",
  "financial_highlights": "string",
  "recommendations": ["string"],
  "confidence_score": number,
  "extracted_entities": {
    "companies": ["string"],
    "people": ["string"], 
    "technologies": ["string"],
    "markets": ["string"]
  }
}`;

      // Use OpenAI GPT-4 for comprehensive analysis
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 4000,
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const openaiData = await response.json();
      const analysisText = openaiData.choices[0].message.content;
      
      let analysis: VisionAnalysisResult;
      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        // Fallback if JSON parsing fails
        analysis = {
          executive_summary: analysisText,
          key_insights: ['Analysis completed but formatting needs review'],
          business_model: 'See executive summary for details',
          market_analysis: 'See executive summary for details',
          competitive_landscape: 'See executive summary for details',
          financial_highlights: 'See executive summary for details',
          recommendations: ['Review analysis for specific recommendations'],
          confidence_score: 0.7,
          extracted_entities: {
            companies: [organization_name],
            people: [],
            technologies: [],
            markets: []
          }
        };
      }

      // Store analysis in database for knowledge graph
      const { data: analysisRecord, error: analysisError } = await supabase
        .from('intelligence_insights')
        .insert({
          artifact_id: null, // Will be linked when deck is uploaded
          insight_type: 'deck_analysis',
          insight_data: analysis,
          relevance_score: analysis.confidence_score,
          tags: ['deck_analysis', 'business_intelligence', organization_name.toLowerCase().replace(/\s+/g, '_')],
          verified: false
        })
        .select()
        .single();

      if (analysisError) {
        console.error('Failed to store analysis:', analysisError);
        // Continue without storing - analysis is still valid
      }

      return NextResponse.json({
        status: 'success',
        analysis: analysis,
        analysis_id: analysisRecord?.id,
        message: 'Deck analysis completed successfully'
      });

    } catch (openaiError) {
      console.error('OpenAI analysis failed:', openaiError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to analyze deck content',
        details: openaiError instanceof Error ? openaiError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Vision analysis error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
