
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('portfolio_guides')
      .select('*')
      .eq('company_id', companyId)
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
       throw error;
    }
    
    if (!data) {
       // Return null if no guide found (frontend will show "Generate" button)
       return NextResponse.json({ guide: null });
    }
    
    return NextResponse.json({ guide: data });
    
  } catch (error) {
    console.error('Fetch guide error:', error);
    return NextResponse.json({ error: 'Failed to fetch guide' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, instruction, currentYaml } = await req.json();
    
    if (!companyId || !instruction) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const systemPrompt = `You are an expert at configuring financial data extraction for SaaS companies.
    Your goal is to modify a YAML configuration file based on the user's request.
    
    The YAML schema structure is:
    company:
      name: string
      business_models: string[]
      currency: string
      fiscal_year_end_month: number
    metrics_mapping:
      metric_key: { labels: string[], unit: string }
    
    RULES:
    1. Only return the valid YAML. No markdown blocks.
    2. Preserve existing keys unless asked to remove.
    3. Ensure valid YAML syntax.
    `;

    const userPrompt = `
    Current YAML:
    ${currentYaml || 'No existing guide.'}
    
    User Instruction:
    ${instruction}
    
    Return the updated YAML.
    `;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0,
    });
    
    const newYaml = completion.choices[0].message.content?.replace(/```yaml/g, '').replace(/```/g, '').trim();
    
    if (!newYaml) {
        throw new Error("Failed to generate YAML");
    }

    // Upsert into DB
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('portfolio_guides')
      .upsert({
        company_id: companyId,
        content_yaml: newYaml,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) throw error;
    
    return NextResponse.json({ guide: data });

  } catch (error: any) {
    console.error('Update guide error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

