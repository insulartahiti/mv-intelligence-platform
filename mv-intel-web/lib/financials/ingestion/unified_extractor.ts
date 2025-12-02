/**
 * Unified Financial Document Extractor
 * 
 * Consolidated extraction pipeline for both PDF and Excel files using:
 * 1. PDF Text Extraction: pdf-lib for text, GPT-5.1 for structured analysis
 * 2. GPT-5.1 Structured: Deep financial reasoning and validation  
 * 3. Deterministic parsing: xlsx library for Excel (fast, precise cell refs)
 * 4. Reconciliation: Merge all results with confidence scoring
 * 5. Perplexity Sonar: Industry benchmark validation (optional)
 * 
 * Note: OpenAI Vision API only accepts images, not PDFs directly.
 * For PDFs, we extract text first then analyze with GPT-5.1.
 * 
 * This unified approach ensures:
 * - Consistent extraction quality across file types
 * - Best-in-class for each task
 * - Cross-validation between methods
 * - Graceful fallbacks
 */

import OpenAI from 'openai';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { FileMetadata } from './load_file';

// Lazy initialization
let openaiClient: OpenAI | null = null;
let perplexityClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for document extraction');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getPerplexity(): OpenAI | null {
  if (!perplexityClient) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.warn('[Perplexity] API key not configured, skipping benchmark enrichment');
      return null;
    }
    perplexityClient = new OpenAI({ 
      apiKey,
      baseURL: 'https://api.perplexity.ai'
    });
  }
  return perplexityClient;
}

// ============================================================================
// Types
// ============================================================================

export interface ExtractedTable {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  sheetName?: string; // For Excel
  page?: number; // For PDF
  confidence: number;
}

export interface FinancialSummary {
  // New structure: separate actuals from budget
  actuals?: Record<string, number>;
  budget?: Record<string, number>;
  // Legacy: key_metrics (for backward compatibility, maps to actuals)
  key_metrics?: Record<string, number>;
  period?: string;           // e.g., "Q3 2025", "September 2025"
  period_type?: string;      // "month", "quarter", "year", "ytd"
  currency?: string;
  business_model?: string;
}

export interface BenchmarkContext {
  industry_benchmarks?: Record<string, { typical_range: string; assessment: string }>;
  market_context?: string;
  flags?: string[];
}

export interface UnifiedExtractionResult {
  fileType: 'pdf' | 'xlsx';
  pageCount: number;
  pages: {
    pageNumber: number;
    text: string;
    tables: ExtractedTable[];
  }[];
  fullText: string;
  financial_summary?: FinancialSummary;
  benchmarks?: BenchmarkContext;
  info: {
    filename: string;
    extractionMethod: string;
    reconciliation_notes?: string;
    deterministic_data?: any; // Raw xlsx data for cell-level access
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Unified extraction for both PDF and Excel files
 * 
 * For PDFs: Uses OpenAI Files API + Responses API for vision-based extraction
 * For Excel: Uses xlsx library + GPT-4o for structured analysis
 */
export async function extractFinancialDocument(file: FileMetadata): Promise<UnifiedExtractionResult> {
  const openai = getOpenAI();
  const filenameLower = file.filename.toLowerCase();
  
  const isPDF = filenameLower.endsWith('.pdf');
  const isExcel = filenameLower.endsWith('.xlsx') || filenameLower.endsWith('.xls');
  
  if (!isPDF && !isExcel) {
    throw new Error(`Unsupported file type: ${file.filename}. Supported: .pdf, .xlsx, .xls`);
  }
  
  console.log(`[Unified Extractor] Processing ${file.filename} (${isPDF ? 'PDF' : 'Excel'})`);
  
  let structuredResult: Partial<UnifiedExtractionResult>;
  let deterministicResult: DeterministicExcelResult | null = null;
  
  if (isPDF) {
    // For PDFs: Upload to Files API, then use Responses API with vision
    structuredResult = await extractWithVisionAPI(openai, file, 'application/pdf');
    
  } else {
    // For Excel: Same approach as PDF - upload to Files API for vision extraction
    // Plus deterministic parsing for precise cell references
    deterministicResult = parseExcelDeterministic(file.buffer);
    console.log(`[Deterministic] Parsed ${deterministicResult.sheets.length} sheets`);
    
    // Upload Excel to Files API for vision-based extraction (charts, formatting)
    const excelMimeType = file.filename.toLowerCase().endsWith('.xlsx') 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    
    structuredResult = await extractWithVisionAPI(openai, file, excelMimeType);
    
    // Merge deterministic data for precise cell lookups
    if (structuredResult.info) {
      structuredResult.info.deterministic_data = deterministicResult;
    }
  }
  
  // Build final result
  const finalResult: UnifiedExtractionResult = {
    fileType: isPDF ? 'pdf' : 'xlsx',
    pageCount: structuredResult.pageCount || 1,
    pages: structuredResult.pages || [],
    fullText: structuredResult.fullText || '',
    financial_summary: structuredResult.financial_summary,
    info: {
      filename: file.filename,
      extractionMethod: isPDF ? 'pdf-vision-responses-api' : 'xlsx-deterministic-gpt4o',
      deterministic_data: deterministicResult,
      reconciliation_notes: structuredResult.info?.reconciliation_notes
    }
  };
  
  // Enrich with Perplexity benchmarks
  const enrichedResult = await enrichWithBenchmarks(finalResult);
  
  console.log(`[Unified Extractor] Complete: ${enrichedResult.pages.length} pages, ${Object.keys(enrichedResult.financial_summary?.key_metrics || {}).length} metrics`);
  
  return enrichedResult;
}

// ============================================================================
// Vision Extraction (Files API + Responses API) - Works for PDF and Excel
// ============================================================================

/**
 * Extract document using OpenAI's Files API + Responses API
 * This enables true vision-based extraction for both PDFs and Excel files
 * 
 * OpenAI extracts both text AND renders images of each page/sheet,
 * giving the model full visual context (charts, formatting, layouts)
 */
async function extractWithVisionAPI(
  openai: OpenAI,
  file: FileMetadata,
  mimeType: string
): Promise<Partial<UnifiedExtractionResult>> {
  const fileType = mimeType.includes('pdf') ? 'PDF' : 'Excel';
  console.log(`[Vision API] Uploading ${file.filename} (${fileType}) to Files API...`);
  
  try {
    // Step 1: Upload file to Files API
    const uploadedFile = await openai.files.create({
      file: new File([file.buffer], file.filename, { type: mimeType }),
      purpose: 'user_data'
    });
    
    console.log(`[Vision API] File uploaded: ${uploadedFile.id}`);
    
    // Step 2: Use Responses API with the file
    const documentType = mimeType.includes('pdf') ? 'PDF report' : 'Excel spreadsheet';
    const systemPrompt = `You are a senior financial analyst extracting data from a portfolio company ${documentType}.

Extract ALL financial data and return structured JSON:

{
  "pageCount": <number>,
  "pages": [
    {
      "pageNumber": 1,
      "text": "Key content from this page",
      "tables": [
        {
          "title": "Table name",
          "headers": ["Metric", "Actual", "Budget", "Variance"],
          "rows": [["MRR", 782800, 750000, 32800]],
          "confidence": 0.95
        }
      ]
    }
  ],
  "financial_summary": {
    "actuals": {
      "arr": 9393600,
      "mrr": 782800,
      "mrr_saas": 429800,
      "mrr_finos": 353000,
      "customers": 106,
      "customers_saas": 61,
      "customers_finos": 45,
      "gross_margin": 0.75,
      "monthly_burn": 130000,
      "cash_balance": 3250000,
      "runway_months": 25,
      "arr_growth_yoy": 0.45,
      "nrr": 1.15,
      "logo_churn": 0.02
    },
    "budget": {
      "arr": 9000000,
      "mrr": 750000,
      "customers": 100
    },
    "period": "September 2025",
    "period_type": "month",
    "currency": "EUR",
    "business_model": "saas"
  }
}

STANDARD METRIC IDs (use these exact keys):
- arr: Annual Recurring Revenue (MRR * 12)
- mrr: Monthly Recurring Revenue (total)
- mrr_saas: MRR from SaaS segment
- mrr_finos: MRR from FinOS/other segment
- customers: Total customer count
- customers_saas: SaaS customer count
- customers_finos: FinOS customer count
- gross_margin: Gross margin percentage (0.75 = 75%)
- monthly_burn: Monthly cash burn
- cash_balance: Current cash position
- runway_months: Cash runway in months
- arr_growth_yoy: Year-over-year ARR growth (0.45 = 45%)
- nrr: Net Revenue Retention (1.15 = 115%)
- grr: Gross Revenue Retention
- logo_churn: Customer churn rate (0.02 = 2%)
- cac: Customer Acquisition Cost
- ltv: Customer Lifetime Value
- payback_months: CAC payback period

CRITICAL - Actual vs Budget:
- Separate "actuals" (reported/actual numbers) from "budget" (plan/forecast)
- Look for columns labeled "Actual", "Budget", "Plan", "Forecast", "Variance"
- If only one set of numbers, assume they are "actuals"

CRITICAL - Period Detection:
- Look for "Q3 2025", "September 2025", "Month ending...", "As of..."
- "period" = REPORTING PERIOD of the data

CRITICAL - Metrics:
- Map ALL metrics to standard IDs above
- Calculate ARR = MRR * 12 if only MRR is given
- Preserve exact numbers (no rounding)
- Convert percentages to decimals (75% = 0.75)`;

    // Use the responses.create endpoint
    const response = await openai.responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_id: uploadedFile.id
            },
            {
              type: 'input_text',
              text: `${systemPrompt}\n\nExtract all financial data from this PDF: "${file.filename}"`
            }
          ]
        }
      ],
      text: { format: { type: 'text' } }
    });

    // Step 3: Parse the response
    const content = response.output_text;
    console.log(`[Vision API] Response received, length: ${content?.length || 0}`);
    
    // Step 4: Clean up - delete the uploaded file
    try {
      await openai.files.del(uploadedFile.id);
      console.log(`[Vision API] Cleaned up file: ${uploadedFile.id}`);
    } catch (cleanupErr) {
      console.warn(`[Vision API] Failed to cleanup file: ${cleanupErr}`);
    }
    
    if (!content) {
      console.warn('[Vision API] No content returned');
      return createEmptyResult(file.filename, 'vision_no_response');
    }

    const method = mimeType.includes('pdf') ? 'pdf-vision-api' : 'excel-vision-api';
    return parseJsonResponse(content, file.filename, method);
    
  } catch (error: any) {
    console.error('[Vision API] Extraction failed:', error?.message || error);
    
    // Fallback: Try base64 inline approach if Files API fails
    console.log('[Vision API] Trying base64 fallback...');
    return extractWithBase64Fallback(openai, file, mimeType);
  }
}

/**
 * Fallback: Send file as base64 inline (for when Files API is unavailable)
 * Works for both PDF and Excel files
 */
async function extractWithBase64Fallback(
  openai: OpenAI,
  file: FileMetadata,
  mimeType: string
): Promise<Partial<UnifiedExtractionResult>> {
  const base64Data = file.buffer.toString('base64');
  const fileType = mimeType.includes('pdf') ? 'PDF' : 'Excel spreadsheet';
  
  const systemPrompt = `You are a senior financial analyst. Extract ALL financial data from this ${fileType} as JSON.

Return:
{
  "pageCount": <number>,
  "pages": [{"pageNumber": 1, "text": "...", "tables": [...]}],
  "financial_summary": {
    "key_metrics": {"arr": ..., "mrr": ..., "gross_margin": ...},
    "period": "Q3 2025",
    "period_type": "quarter", 
    "currency": "EUR",
    "business_model": "saas"
  }
}`;

  try {
    // Try using chat completions with file content type
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extract financial data from: "${file.filename}"` },
            {
              type: 'file',
              file: {
                filename: file.filename,
                file_data: `data:${mimeType};base64,${base64Data}`
              }
            } as any
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createEmptyResult(file.filename, 'base64_no_response');
    }

    const method = mimeType.includes('pdf') ? 'pdf-base64-fallback' : 'excel-base64-fallback';
    return parseJsonResponse(content, file.filename, method);
    
  } catch (error: any) {
    console.error('[Base64 Fallback] Also failed:', error?.message);
    return createEmptyResult(file.filename, 'all_methods_failed');
  }
}

// ============================================================================
// Deterministic Excel Parsing
// ============================================================================

interface DeterministicExcelResult {
  sheets: {
    sheetName: string;
    data: any[][];
    range: string;
  }[];
}

function parseExcelDeterministic(buffer: Buffer): DeterministicExcelResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: DeterministicExcelResult['sheets'] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    const range = worksheet['!ref'] || '';

    sheets.push({ sheetName, data, range });
  }

  return { sheets };
}

// ============================================================================
// Text-based Analysis (for Excel data)
// ============================================================================

interface TextContent {
  pageCount: number;
  pages: { pageNumber: number; text: string }[];
  fullText: string;
}

async function extractWithTextAnalysis(
  openai: OpenAI,
  textContent: TextContent,
  filename: string
): Promise<Partial<UnifiedExtractionResult>> {
  console.log(`[Text Analysis] Analyzing ${textContent.pageCount} pages of text...`);
  
  const systemPrompt = `You are a senior financial analyst extracting data from a spreadsheet.

Extract ALL financial data and return structured JSON:

{
  "pageCount": ${textContent.pageCount},
  "pages": [
    {
      "pageNumber": 1,
      "text": "Summary of key content",
      "tables": [
        {
          "title": "Table name",
          "headers": ["Metric", "Value"],
          "rows": [["ARR", 5000000], ["MRR", 416667]],
          "confidence": 0.95
        }
      ]
    }
  ],
  "financial_summary": {
    "key_metrics": {
      "arr": 5000000,
      "mrr": 416667,
      "gross_margin": 0.75,
      "customers": 150
    },
    "period": "Q3 2025",
    "period_type": "quarter",
    "currency": "EUR",
    "business_model": "saas"
  }
}

CRITICAL:
- Extract ALL financial metrics you can find
- Preserve exact numbers
- Identify the reporting period
- Validate relationships (ARR = MRR * 12)`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract financial data from this spreadsheet: "${filename}"\n\nContent:\n${textContent.fullText.slice(0, 50000)}`
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('[Text Analysis] No content returned');
      return createEmptyResult(filename, 'text_analysis_no_response');
    }

    return parseJsonResponse(content, filename, 'text-analysis-gpt4o');
    
  } catch (error: any) {
    console.error('[Text Analysis] Extraction failed:', error?.message || error);
    return createEmptyResult(filename, 'text_analysis_error');
  }
}

// ============================================================================
// Perplexity Benchmark Enrichment
// ============================================================================

async function enrichWithBenchmarks(result: UnifiedExtractionResult): Promise<UnifiedExtractionResult> {
  const perplexity = getPerplexity();
  if (!perplexity) return result;
  
  const summary = result.financial_summary;
  if (!summary?.key_metrics || Object.keys(summary.key_metrics).length === 0) {
    console.log('[Perplexity] No financial summary to benchmark');
    return result;
  }
  
  const businessModel = summary.business_model || 'saas';
  const currency = summary.currency || 'USD';
  
  console.log(`[Perplexity] Enriching with ${businessModel} benchmarks...`);
  
  try {
    const response = await perplexity.chat.completions.create({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: `You are a financial analyst providing industry benchmark context. Return JSON only.`
        },
        {
          role: 'user',
          content: `For a ${businessModel.toUpperCase()} company with these metrics:
${JSON.stringify(summary.key_metrics, null, 2)}
Currency: ${currency}

Provide industry benchmark context as JSON:
{
  "industry_benchmarks": {
    "gross_margin": { "typical_range": "70-85%", "assessment": "healthy" },
    "arr_growth": { "typical_range": "30-50% YoY", "assessment": "above average" }
  },
  "market_context": "Brief market context",
  "flags": ["any concerns"]
}

Only include benchmarks for metrics provided. Be specific to ${businessModel}.`
        }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1].trim() : content;
      }
      
      result.benchmarks = JSON.parse(jsonStr) as BenchmarkContext;
      console.log(`[Perplexity] Added ${Object.keys(result.benchmarks.industry_benchmarks || {}).length} benchmarks`);
    }
  } catch (error: any) {
    console.warn('[Perplexity] Benchmark enrichment failed:', error?.message);
  }
  
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function parseJsonResponse(content: string, filename: string, method: string): Partial<UnifiedExtractionResult> {
  try {
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1].trim() : content;
    }
    
    const parsed = JSON.parse(jsonStr);
    
    const pages = (parsed.pages || []).map((p: any, idx: number) => ({
      pageNumber: p.pageNumber || idx + 1,
      text: p.text || '',
      tables: p.tables || []
    }));

    return {
      pageCount: parsed.pageCount || pages.length || 1,
      pages,
      fullText: pages.map((p: any) => p.text).join('\n\n'),
      financial_summary: parsed.financial_summary,
      info: {
        filename,
        extractionMethod: method,
        reconciliation_notes: parsed.reconciliation_notes
      }
    };
    
  } catch (parseErr) {
    console.warn(`[${method}] JSON parse failed, returning raw text`);
    return {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: content, tables: [] }],
      fullText: content,
      info: { filename, extractionMethod: `${method}-raw` }
    };
  }
}

function createEmptyResult(filename: string, reason: string): Partial<UnifiedExtractionResult> {
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, text: '', tables: [] }],
    fullText: '',
    info: { filename, extractionMethod: 'failed', reconciliation_notes: reason }
  };
}

// ============================================================================
// Legacy Compatibility Exports
// ============================================================================

// For backward compatibility with existing code
export { parseExcelDeterministic as parseExcel };

