import { NextRequest, NextResponse } from 'next/server';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({
        status: 'error',
        message: 'Content is required'
      }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      // For development, return mock data
      console.warn('OpenAI API key not configured, using mock extraction');
      return NextResponse.json({
        status: 'success',
        company_name: 'Sample Company',
        domain: 'sample.com',
        confidence: 0.8
      });
    }

    try {
      // Use OpenAI to extract company information from deck content
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are an expert at extracting company information from presentation content. 
              Analyze the provided content and extract:
              1. Company name (the main company presenting)
              2. Company domain/website
              3. Industry or business type
              
              Return only a JSON object with these fields:
              {
                "company_name": "string",
                "domain": "string", 
                "industry": "string",
                "confidence": number (0-1)
              }
              
              If you cannot determine a field, use null. Be precise and confident.`
            },
            {
              role: 'user',
              content: `Extract company information from this presentation content:\n\n${content}`
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const analysisText = result.choices[0]?.message?.content || '';

      // Parse the JSON response
      try {
        const extracted = JSON.parse(analysisText);
        return NextResponse.json({
          status: 'success',
          ...extracted
        });
      } catch (parseError) {
        // If JSON parsing fails, try to extract manually
        const companyMatch = analysisText.match(/"company_name":\s*"([^"]+)"/);
        const domainMatch = analysisText.match(/"domain":\s*"([^"]+)"/);
        const industryMatch = analysisText.match(/"industry":\s*"([^"]+)"/);
        const confidenceMatch = analysisText.match(/"confidence":\s*([0-9.]+)/);

        return NextResponse.json({
          status: 'success',
          company_name: companyMatch ? companyMatch[1] : null,
          domain: domainMatch ? domainMatch[1] : null,
          industry: industryMatch ? industryMatch[1] : null,
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5
        });
      }

    } catch (error) {
      console.error('OpenAI extraction failed:', error);
      
      // Fallback: simple text analysis
      const fallbackResult = extractCompanyFallback(content);
      return NextResponse.json({
        status: 'success',
        ...fallbackResult
      });
    }

  } catch (error) {
    console.error('Failed to extract company information:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to extract company information',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Fallback extraction using simple text analysis
function extractCompanyFallback(content: string) {
  // Look for common patterns
  const companyPatterns = [
    /(?:company|corporation|inc|llc|ltd|gmbh|s\.a\.|s\.p\.a\.)\s*:?\s*([A-Z][a-zA-Z\s&]+)/gi,
    /(?:about|overview|company)\s+([A-Z][a-zA-Z\s&]+)/gi,
    /([A-Z][a-zA-Z\s&]+)\s+(?:is|was|are|were)\s+(?:a|an|the)/gi
  ];

  const domainPatterns = [
    /(?:www\.)?([a-zA-Z0-9-]+\.(?:com|org|net|io|ai|co|de|uk|fr|es|it))/gi,
    /(?:website|site|url):\s*([a-zA-Z0-9-]+\.(?:com|org|net|io|ai|co|de|uk|fr|es|it))/gi
  ];

  let companyName = null;
  let domain = null;

  // Try to extract company name
  for (const pattern of companyPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      companyName = match[1].trim();
      break;
    }
  }

  // Try to extract domain
  for (const pattern of domainPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      domain = match[1].trim();
      break;
    }
  }

  return {
    company_name: companyName,
    domain: domain,
    industry: null,
    confidence: (companyName || domain) ? 0.6 : 0.3
  };
}
