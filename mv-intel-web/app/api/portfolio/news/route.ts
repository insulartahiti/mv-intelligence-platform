import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Force dynamic rendering - prevents edge caching issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase credentials');
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyName = searchParams.get('companyName');
    const companyId = searchParams.get('companyId');
    const domain = searchParams.get('domain');
    const industry = searchParams.get('industry');
    const queryOverride = searchParams.get('query');
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Caching Logic
    let cachedData = null;
    const queryHash = crypto.createHash('md5').update(queryOverride || 'default').digest('hex');
    const supabase = getSupabaseClient();

    if (companyId && !forceRefresh) {
      try {
        const { data, error } = await supabase
          .from('portfolio_news_cache')
          .select('*')
          .eq('company_id', companyId)
          .eq('query_hash', queryHash)
          .single();

        if (data && !error) {
          const lastUpdated = new Date(data.updated_at).getTime();
          const now = new Date().getTime();
          const hoursDiff = (now - lastUpdated) / (1000 * 60 * 60);

          if (hoursDiff < 12) {
            return NextResponse.json({ 
              news: data.news_data, 
              cached: true, 
              lastRefreshed: data.updated_at 
            });
          }
        }
      } catch (err) {
        console.warn('Cache check failed:', err);
      }
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.warn('PERPLEXITY_API_KEY is not set');
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
    ${queryOverride ? `\nUser's specific interest: ${queryOverride}\n` : ''}

    Prioritize:
    1. Funding rounds, M&A, and major partnerships.
    2. Product launches or strategic pivots.
    3. Significant employer reviews (e.g. Glassdoor trends), customer testimonials, or press coverage.
    
    Format the output as a valid JSON array of objects with these keys: 
    - "title"
    - "date" (approximate is fine, e.g. "Oct 2024")
    - "source" (domain or publication name)
    - "summary" (1-2 sentences)
    - "url" (direct link to source)
    
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
    const jsonString = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    let news = [];
    try {
      news = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse Perplexity response:', content);
    }

    // Update Cache
    if (companyId && news.length > 0) {
      try {
        await supabase.from('portfolio_news_cache').upsert({
          company_id: companyId,
          query_hash: queryHash,
          news_data: news,
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,query_hash' });
      } catch (err) {
        console.error('Cache update failed:', err);
      }
    }

    return NextResponse.json({ 
      news, 
      cached: false, 
      lastRefreshed: new Date().toISOString() 
    });

  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
