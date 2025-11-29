import { NextRequest, NextResponse } from 'next/server';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { image, slideNumber } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({
        status: 'error',
        message: 'Image data is required'
      }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured, using mock OCR');
      return NextResponse.json({
        status: 'success',
        text: `Mock text extracted from slide ${slideNumber || 1}`,
        confidence: 0.8
      });
    }

    try {
      // Use OpenAI Vision API to extract text from image
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
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract all text content from this slide image. Return only the raw text content, no formatting or analysis. If there are charts, graphs, or visual elements, describe them briefly. Focus on extracting all readable text including titles, bullet points, numbers, and any other text content.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Vision API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      const extractedText = result.choices[0]?.message?.content || '';

      return NextResponse.json({
        status: 'success',
        text: extractedText.trim() || `Slide ${slideNumber || 1} captured successfully`,
        confidence: extractedText.trim() ? 0.9 : 0.3
      });

    } catch (error) {
      console.error('OpenAI Vision OCR failed:', error);
      
      // Fallback: return generic text
      return NextResponse.json({
        status: 'success',
        text: `Slide ${slideNumber || 1} captured successfully`,
        confidence: 0.3
      });
    }

  } catch (error) {
    console.error('Failed to perform OCR:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to perform OCR',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
