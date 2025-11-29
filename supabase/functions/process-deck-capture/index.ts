import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { artifact_id, slides } = await req.json()

    if (!artifact_id || !slides || !Array.isArray(slides)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: artifact_id and slides array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize OpenAI client
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${slides.length} slides for artifact ${artifact_id}`)

    // Process each slide with OCR + Vision analysis
    const processedSlides = []
    for (const slide of slides) {
      try {
        console.log(`Processing slide ${slide.slide_number}`)
        
        // Extract text and analyze visual content using OpenAI Vision
        const analysis = await analyzeSlideWithVision(slide.image_url, openaiApiKey)
        
        // Update existing slide with AI analysis
        const { error: updateError } = await supabase
          .from('slides')
          .update({
            text_content: analysis.extracted_text,
            content_summary: analysis.visual_summary,
            visual_elements: analysis.visual_elements,
            layout_analysis: analysis.layout_analysis,
            confidence_score: analysis.confidence_score,
            updated_at: new Date().toISOString()
          })
          .eq('artifact_id', artifactId)
          .eq('slide_number', slide.slide_number)

        if (updateError) {
          console.error(`Failed to update slide ${slide.slide_number}:`, updateError)
        }

        processedSlides.push({
          slide_number: slide.slide_number,
          extracted_text: analysis.extracted_text,
          visual_summary: analysis.visual_summary,
          visual_elements: analysis.visual_elements
        })

      } catch (error) {
        console.error(`Error processing slide ${slide.slide_number}:`, error)
        // Continue with other slides
      }
    }

    // Create comprehensive deck analysis using all extracted content
    const deckAnalysis = await createDeckAnalysis(processedSlides, openaiApiKey)
    
    // Store analysis in intelligence_insights
    const { error: insightError } = await supabase
      .from('intelligence_insights')
      .insert({
        artifact_id: artifact_id,
        insight_type: 'deck_analysis',
        insight_data: deckAnalysis,
        relevance_score: deckAnalysis.confidence_score,
        tags: ['deck_analysis', 'business_intelligence', 'ocr_processed'],
        verified: false
      })

    if (insightError) {
      console.error('Failed to store deck analysis:', insightError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedSlides.length} slides`,
        processed_slides: processedSlides.length,
        analysis_created: !insightError
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Analyze slide image using OpenAI Vision API
async function analyzeSlideWithVision(imageDataUrl: string, apiKey: string) {
  try {
    // Convert data URL to base64 if needed
    let base64Data: string
    let mimeType: string
    
    if (imageDataUrl.startsWith('data:')) {
      const [header, data] = imageDataUrl.split(',')
      base64Data = data
      // Extract MIME type from data URL header
      const mimeMatch = header.match(/data:([^;]+)/)
      mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    } else {
      base64Data = imageDataUrl
      mimeType = 'image/jpeg' // Default to JPEG
    }

    // Check if image is too large for OpenAI API (max ~20MB base64)
    const imageSizeKB = (base64Data.length * 3) / 4 / 1024
    if (imageSizeKB > 20000) { // 20MB limit
      console.log(`Image too large (${imageSizeKB.toFixed(0)}KB), skipping analysis`)
      return {
        extracted_text: 'Image too large for analysis',
        visual_summary: 'Image size exceeds API limits',
        visual_elements: [],
        layout_analysis: 'Unable to analyze due to size constraints',
        confidence_score: 0
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this presentation slide image comprehensively. Provide:

1. EXTRACTED_TEXT: All readable text content (headings, bullet points, body text)
2. VISUAL_SUMMARY: Description of charts, graphs, diagrams, or visual elements
3. VISUAL_ELEMENTS: List of key visual components (e.g., ["bar chart", "pie chart", "timeline", "logo"])
4. LAYOUT_ANALYSIS: Brief description of slide layout and structure
5. CONFIDENCE_SCORE: 0-1 score for text extraction accuracy

Return as JSON:
{
  "extracted_text": "string",
  "visual_summary": "string", 
  "visual_elements": ["string"],
  "layout_analysis": "string",
  "confidence_score": number
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const result = await response.json()
    const analysisText = result.choices[0]?.message?.content
    
    if (!analysisText) {
      throw new Error('No content returned from OpenAI')
    }

    const analysis = JSON.parse(analysisText)
    
    return {
      extracted_text: analysis.extracted_text || '',
      visual_summary: analysis.visual_summary || '',
      visual_elements: analysis.visual_elements || [],
      layout_analysis: analysis.layout_analysis || '',
      confidence_score: analysis.confidence_score || 0.5
    }

  } catch (error) {
    console.error('Vision analysis error:', error)
    return {
      extracted_text: 'Text extraction failed',
      visual_summary: 'Visual analysis failed',
      visual_elements: [],
      layout_analysis: 'Analysis failed',
      confidence_score: 0.0
    }
  }
}

// Create comprehensive deck analysis from all processed slides
async function createDeckAnalysis(processedSlides: any[], apiKey: string) {
  try {
    // Combine all slide content for comprehensive analysis
    const combinedContent = processedSlides.map(slide => 
      `Slide ${slide.slide_number}:\nText: ${slide.extracted_text}\nVisual: ${slide.visual_summary}`
    ).join('\n\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert business analyst. Analyze this presentation deck comprehensively using both text and visual content.'
          },
          {
            role: 'user',
            content: `Analyze this presentation deck content:

${combinedContent}

Provide comprehensive business analysis in JSON format:
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
}`
          }
        ],
        max_tokens: 3000,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const result = await response.json()
    const analysisText = result.choices[0]?.message?.content
    
    if (!analysisText) {
      throw new Error('No content returned from OpenAI')
    }

    return JSON.parse(analysisText)

  } catch (error) {
    console.error('Deck analysis error:', error)
    return {
      executive_summary: 'Analysis failed due to processing error',
      key_insights: ['Unable to analyze content'],
      business_model: 'Analysis unavailable',
      market_analysis: 'Analysis unavailable',
      competitive_landscape: 'Analysis unavailable',
      financial_highlights: 'Analysis unavailable',
      recommendations: ['Review content manually'],
      confidence_score: 0.0,
      extracted_entities: {
        companies: [],
        people: [],
        technologies: [],
        markets: []
      }
    }
  }
}
