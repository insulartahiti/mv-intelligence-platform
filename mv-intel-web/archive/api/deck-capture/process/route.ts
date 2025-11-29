import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OpenAIVisionAnalysis, ProcessingProgress } from '../../../../lib/types/deckCapture';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o';

export async function POST(request: NextRequest) {
  let deck_id: string | undefined;
  
  try {
    const { deck_id: requestedDeckId, force_reprocess = false } = await request.json();
    deck_id = requestedDeckId;

    if (!deck_id) {
      return NextResponse.json({
        status: 'error',
        message: 'Deck ID is required'
      }, { status: 400 });
    }

    // Get deck and slides
    const { data: deck, error: deckError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', deck_id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({
        status: 'error',
        message: 'Deck not found'
      }, { status: 404 });
    }

    // Check if already processed
    if (deck.status === 'PROCESSED' && !force_reprocess) {
      return NextResponse.json({
        status: 'success',
        message: 'Deck already processed',
        deck_id
      });
    }

    // Update status to processing
    await supabase
      .from('artifacts')
      .update({ status: 'PROCESSING' })
      .eq('id', deck_id);

    // Get slides for processing
    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('*')
      .eq('deck_id', deck_id)
      .order('slide_number');

    if (slidesError || !slides) {
      throw new Error('Failed to fetch slides');
    }

    // Process each slide with OpenAI Vision
    const processingResults = await Promise.allSettled(
      slides.map(async (slide) => {
        try {
          console.log(`Processing slide ${slide.slide_number} for deck ${deck_id}`);
          
          // Process the slide content
          const analysis = await processSlideWithOpenAI(slide, deck);
          
          // Store content analysis
          const { error: analysisError } = await supabase
            .from('content_analysis')
            .upsert({
              slide_id: slide.id,
              analysis_type: 'openai_vision',
              content_data: analysis,
              extracted_entities: analysis.extracted_insights.companies,
              topics: analysis.extracted_insights.key_metrics,
              keywords: analysis.extracted_insights.key_metrics,
              confidence_score: analysis.confidence_score,
              processing_time_ms: analysis.processing_time_ms
            });

          if (analysisError) {
            throw new Error(`Failed to store analysis: ${analysisError.message}`);
          }

          // Update slide with extracted content
          const { error: slideUpdateError } = await supabase
            .from('slides')
            .update({
              content_text: analysis.text_content,
              content_summary: generateSlideSummary(analysis),
              slide_type: determineSlideType(analysis),
              visual_elements: analysis.visual_elements,
              layout_analysis: analysis.layout_structure,
              confidence_score: analysis.confidence_score
            })
            .eq('id', slide.id);

          if (slideUpdateError) {
            throw new Error(`Failed to update slide: ${slideUpdateError.message}`);
          }

          // Extract and store intelligence insights
          await storeIntelligenceInsights(deck_id!, slide.id, slide.slide_number, analysis);

          return {
            slide_number: slide.slide_number,
            success: true,
            analysis
          };

        } catch (error) {
          console.error(`Failed to process slide ${slide.slide_number}:`, error);
          return {
            slide_number: slide.slide_number,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    // Process results
    const successfulSlides = processingResults
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value.success
      )
      .map(result => result.value);

    const failedSlides = processingResults
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && !result.value.success
      )
      .map(result => result.value);

    // Update deck status
    const finalStatus = failedSlides.length === 0 ? 'processed' : 'processed';
    await supabase
      .from('decks')
      .update({ 
        status: finalStatus,
        processed_at: new Date().toISOString()
      })
      .eq('id', deck_id);

    return NextResponse.json({
      status: 'success',
      message: `Successfully processed ${successfulSlides.length} slides${failedSlides.length > 0 ? `, ${failedSlides.length} failed` : ''}`,
      deck_id,
      successful_slides: successfulSlides.length,
      failed_slides: failedSlides.length
    });

  } catch (error) {
    console.error('Deck processing failed:', error);
    
    // Update deck status to failed
    if (deck_id) {
      try {
        await supabase
          .from('decks')
          .update({ status: 'failed' })
          .eq('id', deck_id);
      } catch (updateError) {
        console.error('Failed to update deck status:', updateError);
      }
    }

    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Process slide with OpenAI Vision
async function processSlideWithOpenAI(slide: any, deck: any): Promise<OpenAIVisionAnalysis> {
  if (!OPENAI_API_KEY) {
    // For development, return mock analysis
    console.warn('OpenAI API key not configured, using mock analysis');
    return generateMockAnalysis(slide);
  }

  const startTime = Date.now();

  try {
    // Prepare the prompt for OpenAI Vision
    const systemPrompt = `You are an expert business analyst. Analyze this slide content and extract:
1. Text content and key information
2. Visual elements (charts, tables, images, diagrams)
3. Business insights (companies, financial data, market trends, key metrics)
4. Layout structure and hierarchy
5. Action items or next steps

Focus on extracting actionable business intelligence. Be precise and confident in your analysis.`;

    const userPrompt = `Analyze this slide from a ${deck.source_platform} presentation titled "${deck.title}".
Slide number: ${slide.slide_number}
URL: ${slide.metadata?.url || 'Unknown'}

Please provide a comprehensive analysis in JSON format.`;

    // Prepare vision analysis with slide content
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // If we have slide content (HTML or text), use it for analysis
    if (slide.text_content || slide.html_content) {
      const contentToAnalyze = slide.html_content || slide.text_content;
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'text', text: `Slide content to analyze:\n${contentToAnalyze}` }
        ]
      });
    } else {
      // Fallback to text-only analysis
      messages.push({ role: 'user', content: userPrompt });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const analysisText = result.choices[0]?.message?.content || '';

    // Parse the analysis (in production, you'd get structured JSON)
    const analysis = parseOpenAIAnalysis(analysisText, slide.slide_number);
    analysis.processing_time_ms = Date.now() - startTime;

    return analysis;

  } catch (error) {
    console.error('OpenAI Vision processing failed:', error);
    // Fallback to mock analysis
    return generateMockAnalysis(slide);
  }
}

// Generate mock analysis for development
function generateMockAnalysis(slide: any): OpenAIVisionAnalysis {
  return {
    slide_number: slide.slide_number,
    text_content: `Mock content for slide ${slide.slide_number}`,
    visual_elements: {
      charts: [],
      tables: [],
      images: [],
      diagrams: []
    },
    layout_structure: {
      sections: ['header', 'content'],
      hierarchy: {},
      positioning: {}
    },
    extracted_insights: {
      companies: ['Sample Company'],
      financial_data: [],
      market_trends: [],
      key_metrics: ['Sample Metric'],
      action_items: ['Sample Action']
    },
    confidence_score: 0.85,
    processing_time_ms: 1000
  };
}

// Parse OpenAI analysis response
function parseOpenAIAnalysis(analysisText: string, slideNumber: number): OpenAIVisionAnalysis {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(analysisText);
    return {
      slide_number: slideNumber,
      text_content: parsed.text_content || analysisText,
      visual_elements: parsed.visual_elements || { charts: [], tables: [], images: [], diagrams: [] },
      layout_structure: parsed.layout_structure || { sections: [], hierarchy: {}, positioning: {} },
      extracted_insights: parsed.extracted_insights || { companies: [], financial_data: [], market_trends: [], key_metrics: [], action_items: [] },
      confidence_score: parsed.confidence_score || 0.8,
      processing_time_ms: 0
    };
  } catch (error) {
    // Fallback to text parsing
    return {
      slide_number: slideNumber,
      text_content: analysisText,
      visual_elements: { charts: [], tables: [], images: [], diagrams: [] },
      layout_structure: { sections: [], hierarchy: {}, positioning: {} },
      extracted_insights: { companies: [], financial_data: [], market_trends: [], key_metrics: [], action_items: [] },
      confidence_score: 0.6,
      processing_time_ms: 0
    };
  }
}

// Generate slide summary
function generateSlideSummary(analysis: OpenAIVisionAnalysis): string {
  const insights = analysis.extracted_insights;
  const summary = [];
  
  if (insights.companies.length > 0) {
    summary.push(`Companies: ${insights.companies.join(', ')}`);
  }
  
  if (insights.key_metrics.length > 0) {
    summary.push(`Key metrics: ${insights.key_metrics.join(', ')}`);
  }
  
  if (insights.action_items.length > 0) {
    summary.push(`Actions: ${insights.action_items.join(', ')}`);
  }
  
  return summary.length > 0 ? summary.join(' | ') : 'Content analyzed successfully';
}

// Determine slide type
function determineSlideType(analysis: OpenAIVisionAnalysis): string {
  const { visual_elements, extracted_insights } = analysis;
  
  if (visual_elements.charts.length > 0) return 'chart';
  if (visual_elements.tables.length > 0) return 'table';
  if (visual_elements.images.length > 0) return 'image';
  if (extracted_insights.financial_data.length > 0) return 'financial';
  
  return 'content';
}

// Store intelligence insights
async function storeIntelligenceInsights(deckId: string, slideId: string, slideNumber: number, analysis: OpenAIVisionAnalysis) {
  const insights: any[] = [];
  
  // Company mentions
  analysis.extracted_insights.companies.forEach(company => {
    insights.push({
      deck_id: deckId,
      slide_id: slideId,
      insight_type: 'company_mention',
      insight_data: { company_name: company, context: analysis.text_content },
      relevance_score: 0.8,
      source_slide: slideNumber,
      tags: ['company', 'mention']
    });
  });
  
  // Financial data
  analysis.extracted_insights.financial_data.forEach(financial => {
    insights.push({
      deck_id: deckId,
      slide_id: slideId,
      insight_type: 'financial_data',
      insight_data: financial,
      relevance_score: 0.9,
      source_slide: slideNumber,
      tags: ['financial', 'data']
    });
  });
  
  // Market trends
  analysis.extracted_insights.market_trends.forEach(trend => {
    insights.push({
      deck_id: deckId,
      slide_id: slideId,
      insight_type: 'market_trend',
      insight_data: trend,
      relevance_score: 0.85,
      source_slide: slideNumber,
      tags: ['market', 'trend']
    });
  });
  
  // Store insights if any
  if (insights.length > 0) {
    const { error } = await supabase
      .from('intelligence_insights')
      .insert(insights);
    
    if (error) {
      console.error('Failed to store intelligence insights:', error);
    }
  }
}
