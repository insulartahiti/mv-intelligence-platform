import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyName = searchParams.get('companyName');
    const domain = searchParams.get('domain');
    const industry = searchParams.get('industry');

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.warn('PERPLEXITY_API_KEY is not set');
      // Return empty news instead of error to not break UI
      return NextResponse.json({ news: [] });
    }

    const perplexity = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.perplexity.ai',
    });

    let context = `Company: ${companyName}`;
    if (domain) context += `\nDomain: ${domain}`;
    if (industry) context += `\nIndustry: ${industry}`;

    const prompt = `Find the 3-5 most significant latest news updates, reviews, or market signals for "${companyName}" (${domain || ''}) from the last 12 months.
    
    Context:
    ${context}

    Prioritize:
    1. Funding rounds, M&A, and major partnerships.
    2. Product launches or strategic pivots.
    3. Significant employer reviews (e.g. Glassdoor trends), customer testimonials, or press coverage.
    
    Format the output as a valid JSON array of objects with these keys: 
    - "title"
    - "date" (approximate is fine, e.g. "Oct 2024")
    - "source" (domain or publication name)
    - "summary" (1-2 sentences)
    
    Do not include any markdown formatting or explanations, just the JSON array.`;

    const response = await perplexity.chat.completions.create({
      model: 'sonar-pro', 
      messages: [
        { role: 'system', content: 'You are a helpful business intelligence assistant. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '[]';
    
    // Clean up markdown code blocks if present (e.g. ```json ... ```)
    const jsonString = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    let news = [];
    try {
      news = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse Perplexity response:', content);
    }

    return NextResponse.json({ news });
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
