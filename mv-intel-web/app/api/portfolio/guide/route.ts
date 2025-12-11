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
  
  for (const rawPath of filePaths) {
    // Strip bucket prefix if present
    const path = rawPath.replace(/^financial-docs\//, '');
    
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
    const type = searchParams.get('type') || 'financial'; // Default to financial
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }
    
    console.log(`[Guide API] Fetching guide for company=${companyId}, type=${type}`);
    
    const supabase = getSupabaseClient();
    
    // First, check if the type column exists by querying with a broader select
    // If the type column doesn't exist (migration not run), fall back to no type filter
    let query = supabase
      .from('portfolio_guides')
      .select('*')
      .eq('company_id', companyId);
    
    // Try to filter by type - this column was added in a migration
    // If it fails, we'll catch and retry without the type filter
    try {
      const { data, error } = await query.eq('type', type).maybeSingle();
      
      if (error) {
        // Check if error is due to missing column
        if (error.message?.includes('type') && error.message?.includes('does not exist')) {
          console.warn('[Guide API] Type column not found, falling back to query without type filter');
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('portfolio_guides')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();
          
          if (fallbackError) {
            console.error('[Guide API] Fallback fetch error:', fallbackError);
            return NextResponse.json({ error: `Database error: ${fallbackError.message}` }, { status: 500 });
          }
          
          return NextResponse.json({ guide: fallbackData || null });
        }
        
        console.error('[Guide API] Fetch guide error:', error);
        return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
      }
      
      console.log(`[Guide API] Found guide: ${data ? 'yes' : 'no'}`);
      return NextResponse.json({ guide: data || null });
      
    } catch (queryError: any) {
      console.error('[Guide API] Query execution error:', queryError);
      return NextResponse.json({ error: queryError.message || 'Query failed' }, { status: 500 });
    }
    
  } catch (error: any) {
    console.error('[Guide API] Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch guide' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, instruction, currentYaml, filePaths, type = 'financial', manualSave } = await req.json();
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    console.log(`[Guide API] POST request for company=${companyId}, type=${type}, manualSave=${manualSave}`);

    const supabase = getSupabaseClient();
    let newYaml = "";

    if (manualSave) {
        if (!currentYaml) {
            return NextResponse.json({ error: 'No YAML content provided for manual save' }, { status: 400 });
        }
        newYaml = currentYaml;
        console.log(`[Guide API] Manual save requested, skipping AI generation`);
    } else {
        // Check for OpenAI API key early if generating
        if (!process.env.OPENAI_API_KEY) {
          console.error('[Guide API] OPENAI_API_KEY is not configured');
          return NextResponse.json({ error: 'OpenAI API key not configured on server' }, { status: 500 });
        }

        let fileContext = "";
        
        if (filePaths && Array.isArray(filePaths) && filePaths.length > 0) {
          console.log(`[Guide API] Extracting context from ${filePaths.length} files`);
          fileContext = await extractFileContext(filePaths, supabase);
          console.log(`[Guide API] Extracted ${fileContext.length} chars of context`);
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        // Helper to run completion with retries/fallback
        const generateGuide = async (promptContext: string, retryCount = 0): Promise<string> => {
          try {
             const systemPrompt = `You are an expert at configuring financial data extraction for portfolio companies.
Your goal is to create a COMPREHENSIVE YAML configuration file that will guide automatic extraction of financial metrics from uploaded documents.

IMPORTANT: Generate a DETAILED guide with ALL sections populated based on the uploaded files. Do NOT generate a minimal skeleton.

## COMPLETE YAML SCHEMA (include ALL relevant sections):

company:
  name: string                    # Full company name
  slug: string                    # URL-safe identifier (lowercase, no spaces)
  business_models: string[]       # e.g. [saas, marketplace, factoring, pos, lending]
  currency: string                # e.g. EUR, USD
  fiscal_year_end_month: number   # 1-12
  main_entities:                  # Optional: legal entities if mentioned
    - name: string
      role: string                # e.g. operating_company, spv, holding

reporting_profile:
  cadence: string                 # monthly, quarterly, annual
  primary_period_granularity: string
  scenario_defaults:
    - name: string                # e.g. Actuals, Budget, Forecast
      code: string                # e.g. ACT, BUD, FCST

source_docs:                      # Document templates found in the files
  - id: string                    # e.g. 2024_q3_board_deck
    type: string                  # monthly_investor_report, board_deck, budget_file
    description: string
    key_sections: string[]        # Sections/slides mentioned in the doc

document_structure:               # CRITICAL: Map where metrics appear in documents
  <template_name>:
    kpi_tables:
      <table_name>:
        anchor_text: string[]     # Text that identifies this table (e.g. "Revenue KPIs", "Other KPIs")
        granularity: string       # monthly, quarterly
        metric_rows:              # Map row labels to metric IDs
          <metric_id>: "Exact Row Label From Document"

metrics_mapping:                  # CRITICAL: Define ALL metrics found in files
  <metric_id>:                    # Use snake_case (e.g. total_revenue, monthly_burn)
    labels: string[]              # Exact label(s) as they appear in documents
    description: string           # What this metric measures
    unit: string                  # EUR_k, EUR_m, count, percent, months
    notes: string[]               # Optional clarifications

line_item_mapping:                # P&L and financial statement mappings
  revenue_total:
    patterns: string[]            # e.g. ["Total Revenue", "Net Revenue"]
  revenue_<segment>:
    patterns: string[]
  cogs_total:
    patterns: string[]
  ebitda:
    patterns: string[]

## EXTRACTION RULES:

1. SCAN the file content for ALL tables with financial data (KPIs, P&L, Cash Flow, etc.)
2. IDENTIFY the exact row/column labels used (copy them verbatim into "labels" and "metric_rows")
3. INFER metric IDs using snake_case (e.g. "Total MRR" → total_mrr, "Cash Balance" → cash_balance)
4. MAP document structure by noting anchor text that identifies each table
5. INCLUDE all business metrics found: revenue, customers, burn, cash, runway, churn, etc.

## EXAMPLE (abbreviated):

company:
  name: Example SaaS GmbH
  slug: example-saas
  business_models: [saas, marketplace]
  currency: EUR
  fiscal_year_end_month: 12

document_structure:
  monthly_report:
    kpi_tables:
      revenue_kpis:
        anchor_text: ["Revenue KPIs", "MRR Overview"]
        metric_rows:
          total_mrr: "Total MRR"
          saas_mrr: "SaaS MRR"
      other_kpis:
        anchor_text: ["Other KPIs"]
        metric_rows:
          total_customers: "Total Customers"
          monthly_churn: "Monthly Churn Rate"
      financials:
        anchor_text: ["Financial Summary", "Cash Position"]
        metric_rows:
          monthly_burn: "Monthly Burn"
          cash_balance: "Cash Balance"
          runway_months: "Runway"

metrics_mapping:
  total_mrr:
    labels: ["Total MRR", "Total Monthly Recurring Revenue"]
    description: "Total monthly recurring revenue across all products"
    unit: "EUR_k"
  total_customers:
    labels: ["Total Customers", "Active Customers"]
    description: "Number of paying customers"
    unit: "count"
  monthly_burn:
    labels: ["Monthly Burn", "Net Burn"]
    description: "Net cash burn per month"
    unit: "EUR_m"
  cash_balance:
    labels: ["Cash Balance", "Cash Position"]
    description: "Available cash"
    unit: "EUR_m"
  runway_months:
    labels: ["Runway", "Runway (months)"]
    description: "Months of runway at current burn"
    unit: "months"

line_item_mapping:
  revenue_total:
    patterns: ["Total Revenue", "Net Revenue"]
  revenue_saas:
    patterns: ["SaaS Revenue", "Subscription Revenue"]
  cogs_total:
    patterns: ["Cost of Sales", "COGS"]
  ebitda:
    patterns: ["EBITDA", "Operating Income"]

## OUTPUT RULES:
1. Return ONLY valid YAML (no markdown code blocks, no explanations)
2. Generate a COMPREHENSIVE guide with 50+ lines minimum
3. Extract EVERY metric you can identify from the file content
4. Use exact labels from the documents in the "labels" arrays
5. If unsure about a unit, use the most likely (EUR_k for monetary KPIs, count for customers)
`;

            const userPrompt = `${currentYaml ? `CURRENT GUIDE (preserve and enhance):\n${currentYaml}\n\n` : ''}${instruction ? `USER INSTRUCTION: ${instruction}\n\n` : ''}${promptContext ? `DOCUMENT CONTENT TO ANALYZE:\n${promptContext}\n\n` : ''}TASK: ${promptContext 
  ? 'Analyze the document content above and generate a COMPREHENSIVE financial extraction guide. Extract ALL metrics, tables, and KPIs you can identify. Map exact labels from the documents. Generate at minimum: company info, document_structure with anchor_text for each table, metrics_mapping for every metric found, and line_item_mapping for P&L items.'
  : 'Create a starter guide template that can be customized for this company.'}

Return ONLY the YAML (no markdown, no explanations).`;

            console.log(`[Guide API] Calling OpenAI gpt-5.1 (attempt ${retryCount + 1})`);
            
            const completion = await openai.chat.completions.create({
              model: "gpt-5.1", // Primary model for guide generation
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0,
            });
            
            const result = completion.choices[0].message.content?.replace(/```yaml/g, '').replace(/```/g, '').trim() || "";
            console.log(`[Guide API] Generated ${result.length} chars of YAML`);
            return result;
            
          } catch (error: any) {
            console.error(`[Guide API] OpenAI error:`, error.message || error);
            
            // If it fails due to context length and we haven't retried yet, try with truncated context
            const isContextError = error.code === 'context_length_exceeded' || 
                                   (error.message && error.message.toLowerCase().includes('maximum context length'));
                                   
            if (retryCount === 0 && isContextError && promptContext.length > 50000) {
               console.warn("[Guide API] Context too long, retrying with truncated context...");
               return generateGuide(promptContext.substring(0, 50000) + "\n...[TRUNCATED]...", 1);
            }
            throw error;
          }
        };
        
        newYaml = await generateGuide(fileContext);
    }
    
    if (!newYaml) {
        return NextResponse.json({ error: 'Failed to generate or save YAML' }, { status: 500 });
    }

    console.log(`[Guide API] Upserting guide to database`);
    
    if (!newYaml) {
        return NextResponse.json({ error: 'Failed to generate YAML - empty response from AI' }, { status: 500 });
    }

    console.log(`[Guide API] Upserting guide to database`);
    
    // Try upsert with type column first, fall back if column doesn't exist
    try {
      const { data, error } = await supabase
        .from('portfolio_guides')
        .upsert({
          company_id: companyId,
          type: type,
          content_yaml: newYaml,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'company_id,type'
        })
        .select()
        .single();
        
      if (error) {
        // Check if error is due to missing type column
        if (error.message?.includes('type') && (error.message?.includes('does not exist') || error.message?.includes('column'))) {
          console.warn('[Guide API] Type column issue, trying upsert without type');
          
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('portfolio_guides')
            .upsert({
              company_id: companyId,
              content_yaml: newYaml,
              updated_at: new Date().toISOString()
            }, { 
              onConflict: 'company_id'
            })
            .select()
            .single();
            
          if (fallbackError) {
            console.error('[Guide API] Fallback upsert error:', fallbackError);
            return NextResponse.json({ error: `Database error: ${fallbackError.message}` }, { status: 500 });
          }
          
          console.log(`[Guide API] Guide saved successfully (fallback mode)`);
          return NextResponse.json({ guide: fallbackData });
        }
        
        console.error('[Guide API] Upsert error:', error);
        return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
      }
      
      console.log(`[Guide API] Guide saved successfully`);
      return NextResponse.json({ guide: data });
      
    } catch (dbError: any) {
      console.error('[Guide API] Database operation failed:', dbError);
      return NextResponse.json({ error: dbError.message || 'Database operation failed' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[Guide API] Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update guide' }, { status: 500 });
  }
}
