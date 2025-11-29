import { NextRequest, NextResponse } from 'next/server';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface CompanyExtractionRequest {
  content: string;
  source_url?: string;
  title?: string;
}

interface CompanyExtractionResult {
  company_name: string;
  company_domain: string;
  website_url: string;
  confidence: number;
  extracted_from: 'content' | 'url' | 'title' | 'combined';
  additional_info?: {
    industry?: string;
    description?: string;
    key_people?: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: CompanyExtractionRequest = await request.json();
    const { content, source_url, title } = body;

    if (!content) {
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
        company_info: {
          company_name: 'Sample Company',
          company_domain: 'sample.com',
          website_url: 'https://sample.com',
          confidence: 0.8,
          extracted_from: 'content',
          additional_info: {
            industry: 'Technology',
            description: 'A technology company focused on innovation'
          }
        }
      });
    }

    // Create a comprehensive prompt for company extraction
    const prompt = `
Analyze the following presentation content and extract company information. Focus on identifying the main company presenting or being discussed.

Content: ${content.substring(0, 4000)} // Limit content to avoid token limits

${source_url ? `Source URL: ${source_url}` : ''}
${title ? `Title: ${title}` : ''}

Please extract and return ONLY a JSON object with the following structure:
{
  "company_name": "The main company name (e.g., 'Acme Corp')",
  "company_domain": "The company's domain (e.g., 'acme.com')",
  "website_url": "Full website URL (e.g., 'https://www.acme.com')",
  "confidence": 0.0-1.0,
  "extracted_from": "content|url|title|combined",
  "additional_info": {
    "industry": "Industry sector if mentioned",
    "description": "Brief company description if available",
    "key_people": ["Person names if mentioned"]
  }
}

Rules:
- If no clear company is identified, use "Unknown Company" with confidence 0.1
- Extract domain from URL if provided and no company name found in content
- Be conservative with confidence scores
- Return ONLY the JSON object, no other text
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting company information from presentation content. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content?.trim();

    if (!extractedText) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    let companyInfo: CompanyExtractionResult;
    try {
      companyInfo = JSON.parse(extractedText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', extractedText);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Validate the response structure
    if (!companyInfo.company_name || !companyInfo.company_domain) {
      throw new Error('Incomplete company information extracted');
    }

    return NextResponse.json({
      status: 'success',
      company_info: companyInfo
    });

  } catch (error) {
    console.error('Company extraction failed:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to extract company information',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
