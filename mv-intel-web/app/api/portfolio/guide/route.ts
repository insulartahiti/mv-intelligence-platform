import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as XLSX from 'xlsx';
import { parsePDF } from '../../../../lib/financials/ingestion/parse_pdf';

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
        
        // Read ALL sheets
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          
          // Take first 100 rows (increased from 20) to capture more structure
          const rows = json.slice(0, 100).map((row: any) => row.join(' | ')).join('\n');
          
          if (rows.trim().length === 0) {
             context += `SHEET: ${sheetName} (Empty)\n`;
          } else {
             context += `SHEET: ${sheetName}\n${rows}\n...\n`;
          }
        }
      } else if (path.toLowerCase().endsWith('.pdf')) {
        context += `\n\n--- FILE: ${path} (PDF) ---\n`;
        try {
          // Use the project's standard PDF parser
          const pdfContent = await parsePDF({ 
            buffer, 
            filename: path, 
            path: path 
          });
          
          // Read FULL document (all pages)
          // "we should not limit to first three pages, it should read the full doc"
          context += `PAGE COUNT: ${pdfContent.pageCount}\n`;
          for (const page of pdfContent.pages) {
             // Still limiting per-page slightly to prevent massive garbage/binary dumps
             // but capturing enough for financial tables
             const text = page.text; 
             context += `PAGE ${page.pageNumber}:\n${text}\n...\n`;
          }
        } catch (err: any) {
           console.warn(`Error parsing PDF ${path}:`, err);
           context += `[Error extracting PDF text: ${err.message}]\n`;
        }
      } else {
        // For other binary types
        context += `\n\n--- FILE: ${path} (Binary) ---\n[Content analysis not fully supported for this file type]\n`;
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
    
    // Helper to run completion with retries/fallback
    const generateGuide = async (promptContext: string, retryCount = 0): Promise<string> => {
      try {
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
    ${instruction || (promptContext ? 'Generate a guide based on the attached files.' : 'Create a default guide.')}
    
    ${promptContext ? `\nFile Content Samples:\n${promptContext}` : ''}
    
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
        
        return completion.choices[0].message.content?.replace(/```yaml/g, '').replace(/```/g, '').trim() || "";
      } catch (error: any) {
        // If it fails due to context length and we haven't retried yet, try with truncated context
        const isContextError = error.code === 'context_length_exceeded' || 
                               (error.message && error.message.toLowerCase().includes('maximum context length'));
                               
        if (retryCount === 0 && isContextError && promptContext.length > 50000) {
           console.warn("First guide generation attempt failed (context length), retrying with truncated context...");
           // Truncate to first 50k chars (approx 12-15k tokens) as a fallback
           return generateGuide(promptContext.substring(0, 50000) + "\n...[TRUNCATED]...", 1);
        }
        throw error;
      }
    };
    
    const newYaml = await generateGuide(fileContext);
    
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
