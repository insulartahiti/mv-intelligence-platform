import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase credentials');
  return createClient(supabaseUrl, supabaseKey);
}

// Helper to extract text context from files
async function extractFileContext(filePaths: string[], supabase: any): Promise<string> {
  let context = "";
  
  for (const path of filePaths) {
    try {
      // Download file from storage
      const { data, error } = await supabase.storage
        .from('financial-docs')
        .download(path);
        
      if (error || !data) {
        console.warn(`Failed to download ${path}:`, error);
        continue;
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      if (path.endsWith('.xlsx') || path.endsWith('.xls')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        context += `\n\n--- FILE: ${path} (Excel) ---\n`;
        
        // Read first 2 sheets or sheets named 'P&L', 'Revenue'
        const sheetsToRead = workbook.SheetNames.slice(0, 2);
        
        for (const sheetName of sheetsToRead) {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          
          // Take first 20 rows as sample structure
          const rows = json.slice(0, 20).map((row: any) => row.join(' | ')).join('\n');
          context += `SHEET: ${sheetName}\n${rows}\n...\n`;
        }
      } else {
        // For PDF/other, just mention availability (text extraction requires more deps)
        // Or if we have text extraction logic available, use it.
        // For now, just passing the filename is better than nothing.
        context += `\n\n--- FILE: ${path} (Binary) ---\n[Content analysis not fully supported in this simplified view]\n`;
      }
    } catch (err) {
      console.warn(`Error processing ${path}:`, err);
    }
  }
  return context;
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
    const { companyId, instruction, currentYaml, filePaths } = await req.json();
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let fileContext = "";
    
    if (filePaths && Array.isArray(filePaths) && filePaths.length > 0) {
      fileContext = await extractFileContext(filePaths, supabase);
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const systemPrompt = `You are an expert at configuring financial data extraction for SaaS companies.
    Your goal is to create or modify a YAML configuration file based on user instructions and provided file samples.
    
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
    4. If file content is provided, use it to infer metric labels (e.g. if file has "Total Revenue", map 'revenue' to labels: ["Total Revenue"]).
    `;

    const userPrompt = `
    Current YAML:
    ${currentYaml || 'No existing guide.'}
    
    User Instruction:
    ${instruction || (fileContext ? 'Generate a guide based on the attached files.' : 'Create a default guide.')}
    
    ${fileContext ? `\nFile Content Samples:\n${fileContext}` : ''}
    
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
