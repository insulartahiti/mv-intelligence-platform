/**
 * Unified Financial Document Extractor
 * 
 * Consolidated extraction pipeline for both PDF and Excel files using:
 * 1. GPT-5.1: Primary model for vision + structured analysis (released Nov 2025)
 * 2. OpenAI Files API + Responses API: Native PDF/Excel processing
 * 3. Deterministic parsing: xlsx library for Excel (fast, precise cell refs)
 * 4. Reconciliation: Merge all results with confidence scoring
 * 5. Perplexity Sonar: Industry benchmark validation (optional)
 * 
 * GPT-5.1 Features:
 * - Adaptive Reasoning: Adjusts response time based on query complexity
 * - Enhanced vision capabilities for document understanding
 * - Improved instruction-following for financial contexts
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
import { PortcoGuide } from '../portcos/types';

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
// Supabase Edge Function Integration
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface EdgeFunctionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Call a Supabase Edge Function
 * Used for heavy operations that exceed Vercel's timeout limits
 */
async function callEdgeFunction<T>(
  functionName: string, 
  body: any,
  timeoutMs = 300000 // 5 minutes default
): Promise<EdgeFunctionResponse<T>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { success: false, error: 'Supabase not configured' };
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Edge function error: ${error}` };
    }
    
    const data = await response.json();
    return { success: true, data };
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Edge function timed out' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Extract Excel using Supabase Edge Function (Assistants API)
 * Falls back to local extraction if Edge Function unavailable
 */
async function extractExcelViaEdgeFunction(
  file: FileMetadata,
  guide?: PortcoGuide
): Promise<Partial<UnifiedExtractionResult> | null> {
  console.log(`[Edge Function] Attempting Excel extraction via Supabase...`);
  
  const payload: any = {
    filename: file.filename,
    companyName: guide?.company_metadata?.name,
    currency: guide?.company_metadata?.currency,
    businessModels: guide?.company_metadata?.business_models,
    guideHints: guide ? {
      metricLabels: (guide.mapping_rules as any)?.metrics_labels,
      sheetHints: Object.keys(guide.mapping_rules || {}).filter(k => k !== 'metrics_labels'),
      mappingRules: guide.mapping_rules
    } : undefined
  };

  // Prefer storage path if available (avoids base64 overhead)
  if (file.path && file.path.startsWith('financial-docs/')) {
    payload.storagePath = file.path;
  } else {
    payload.excelBase64 = file.buffer.toString('base64');
  }
  
  const response = await callEdgeFunction<any>('extract-excel-assistant', payload, 300000); // 5 minute timeout
  
  if (!response.success || !response.data) {
    console.warn(`[Edge Function] Failed: ${response.error}`);
    return null;
  }
  
  const edgeResult = response.data;
  
  if (!edgeResult.success) {
    console.warn(`[Edge Function] Extraction failed: ${edgeResult.error}`);
    return null;
  }
  
  const summary = edgeResult.financial_summary;
  const metricsCount = Object.keys(summary?.actuals || {}).length + Object.keys(summary?.budget || {}).length;
  console.log(`[Edge Function] Excel extraction successful: found ${metricsCount} metrics`);
  
  if (metricsCount === 0) {
    console.warn(`[Edge Function] Warning: No metrics found in financial_summary. Raw analysis length: ${edgeResult.raw_analysis?.length}`);
    console.log(`[Edge Function] Raw Analysis:\n${edgeResult.raw_analysis}`);
    console.log(`[Edge Function] Financial Summary:`, JSON.stringify(summary, null, 2));
  }
  
  // Convert Edge Function result to UnifiedExtractionResult format
  return {
    fileType: 'xlsx',
    pageCount: 1,
    pages: [{
      pageNumber: 1,
      text: edgeResult.raw_analysis || 'Excel extraction via Assistants API',
      tables: []
    }],
    fullText: edgeResult.raw_analysis || '',
    financial_summary: summary,
    info: {
      filename: file.filename,
      extractionMethod: 'supabase-edge-assistants-api'
    }
  };
}

/**
 * Render PDF snippet via Supabase Edge Function (magick-wasm)
 * Returns the URL of the rendered image
 */
export async function renderPdfSnippetViaEdge(
  storagePath: string,
  pageNumber: number,
  annotations?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    value: string;
  }>,
  outputPath?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  console.log(`[Edge Function] Rendering PDF snippet page ${pageNumber}...`);
  
  // Use 300 DPI for better readability
  const response = await callEdgeFunction<{ url: string; path: string }>('render-pdf-snippet', {
    storagePath,
    pageNumber,
    annotations,
    outputPath,
    dpi: 300, 
    format: 'png',
    // Add padding to crop region if provided (handled in caller usually, but good to be safe)
  }, 60000); // 1 minute timeout for rendering
  
  if (!response.success || !response.data) {
    return { success: false, error: response.error };
  }
  
  return { success: true, url: response.data.url };
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

export interface SourceLocation {
  page: number;
  sheet?: string; // Excel sheet name
  cell?: string;  // Excel cell reference (e.g. "B4")
  bbox?: {
    x: number;      // Left edge as percentage (0-1)
    y: number;      // Top edge as percentage (0-1)
    width: number;  // Width as percentage (0-1)
    height: number; // Height as percentage (0-1)
  };
}

export interface VarianceExplanation {
  metric_id: string;
  explanation: string;
  explanation_type: 'restatement' | 'correction' | 'one_time' | 'forecast_revision' | 'commentary' | 'other';
  source_page?: number;
  confidence: number; // 0-1, how confident we are this explanation applies
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
  // Source locations for audit trail highlighting
  source_locations?: Record<string, SourceLocation>;
  
  // Multi-period support (Time Series)
  multi_periods?: {
    period: string;
    actuals: Record<string, number>;
    budget?: Record<string, number>;
  }[];
  
  // Variance explanations extracted from commentary/notes in the document
  variance_explanations?: VarianceExplanation[];
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
 * For Excel: Uses xlsx library + GPT-5.1 for structured analysis
 */
export async function extractFinancialDocument(file: FileMetadata, guide?: PortcoGuide): Promise<UnifiedExtractionResult> {
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
    structuredResult = await extractWithVisionAPI(openai, file, 'application/pdf', guide);
    
  } else {
    // For Excel: HYBRID EXTRACTION STRATEGY
    // 
    // Priority order:
    // 1. Supabase Edge Function (Assistants API) - Best for complex Excel, no timeout limits
    // 2. Vision-Guided 2-Phase (Local) - Best accuracy with context hints
    // 3. Chat API Single-Pass (Serverless fallback) - Works on Vercel
    
    deterministicResult = parseExcelDeterministic(file.buffer);
    console.log(`[Deterministic] Parsed ${deterministicResult.sheets.length} sheets`);
    
    // Check environment
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const hasSupabaseEdge = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
    
    // Strategy 1: Try Supabase Edge Function first (best for complex Excel)
    if (hasSupabaseEdge) {
      console.log(`[Excel] Attempting Supabase Edge Function extraction...`);
      const edgeResult = await extractExcelViaEdgeFunction(file, guide);
      
      if (edgeResult) {
        structuredResult = edgeResult;
        // Still attach deterministic data for cell-level lookups
        if (structuredResult.info) {
          structuredResult.info.deterministic_data = deterministicResult;
        }
      } else {
        console.log(`[Excel] Edge Function unavailable, falling back to local extraction`);
        structuredResult = await extractExcelLocally(openai, deterministicResult, file.filename, guide, isServerless);
      }
    } else {
      // No Edge Function available, use local extraction
      structuredResult = await extractExcelLocally(openai, deterministicResult, file.filename, guide, isServerless);
    }
    
    // Attach deterministic data for precise cell lookups
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
  mimeType: string,
  guide?: PortcoGuide
): Promise<Partial<UnifiedExtractionResult>> {
  const fileType = mimeType.includes('pdf') ? 'PDF' : 'Excel';
  console.log(`[Vision API] Uploading ${file.filename} (${fileType}) to Files API...`);
  
  try {
    // Step 1: Upload file to Files API
    const uploadedFile = await openai.files.create({
      file: new File([file.buffer as any], file.filename, { type: mimeType }),
      purpose: 'user_data'
    });
    
    console.log(`[Vision API] File uploaded: ${uploadedFile.id}`);
    
    // Step 2: Build system prompt with guide context
    const documentType = mimeType.includes('pdf') ? 'PDF report' : 'Excel spreadsheet';
    
    // Generate guide context for the LLM
    let guideContext = '';
    if (guide) {
      guideContext = `\n\nCOMPANY-SPECIFIC CONTEXT (use these hints to find metrics):
Company: ${guide.company_metadata?.name || 'Unknown'}
Business Model: ${(guide.company_metadata?.business_models || []).join(', ')}
Currency: ${guide.company_metadata?.currency || 'EUR'}

KNOWN METRIC LABELS TO LOOK FOR:`;
      
      // Add mapping hints from guide (checking both structures)
      const mappingRules = guide.mapping_rules?.line_items || (guide as any).metrics_mapping || {};
      if (Object.keys(mappingRules).length > 0) {
        for (const [key, rule] of Object.entries(mappingRules)) {
          const r = rule as any;
          const label = r.label_match || (Array.isArray(r.labels) ? r.labels[0] : r.labels);
          if (label) {
            guideContext += `\n- "${label}" → map to "${key}"`;
          }
        }
      }
    }
    
    const systemPrompt = `You are a senior financial analyst extracting data from a portfolio company ${documentType}.

TASK: Extract ALL financial metrics AND any explanatory commentary about variances or changes.

RESPONSE FORMAT (use actual values from the document, NOT these examples):
{
  "pageCount": <actual page count>,
  "pages": [
    {
      "pageNumber": <page number where data was found>,
      "text": "<summary of financial content on this page>",
      "tables": [{"title": "...", "headers": [...], "rows": [...], "confidence": 0.95}]
    }
  ],
  "financial_summary": {
    "actuals": {
      "<metric_id>": <actual value from document>
    },
    "budget": {
      "<metric_id>": <budget value if found>
    },
    "period": "<reporting period found in document>",
    "period_type": "month|quarter|year",
    "currency": "<currency>",
    "business_model": "saas|marketplace|fintech",
    "source_locations": {
      "<metric_id>": { "page": <page number>, "sheet": "SheetName", "cell": "B4", "bbox": { "x": 0.5, "y": 0.5, "width": 0.1, "height": 0.05 } }
    },
    "multi_periods": [
      {
        "period": "YYYY-MM-DD",
        "actuals": { "<metric_id>": 123 },
        "budget": { "<metric_id>": 130 }
      }
    ],
    "variance_explanations": [
      {
        "metric_id": "<metric this explanation relates to>",
        "explanation": "<exact text explaining why the number changed or differs>",
        "explanation_type": "restatement|correction|one_time|forecast_revision|commentary|other",
        "source_page": <page number where explanation was found>,
        "confidence": 0.9
      }
    ]
  }
}

STANDARD METRIC IDs (use these exact keys when you find matching data):
- mrr: Monthly Recurring Revenue (total)
- arr: Annual Recurring Revenue (MRR * 12, calculate if not explicit)
- mrr_saas: MRR from SaaS/subscription segment
- mrr_finos: MRR from FinOS/factoring segment  
- customers: Total customer count
- gross_margin: Gross margin as decimal (0.75 = 75%)
- monthly_burn: Monthly net cash burn
- cash_balance: Current cash position
- runway_months: Months of runway remaining
- nrr: Net Revenue Retention as decimal (1.15 = 115%)
- grr: Gross Revenue Retention
- logo_churn: Customer churn rate as decimal

VARIANCE EXPLANATION TYPES:
- restatement: Prior period numbers were restated/corrected (HIGH PRIORITY - these override other sources)
- correction: Accounting error was fixed
- one_time: One-time event (acquisition, write-off, etc.)
- forecast_revision: Budget/forecast was updated with new assumptions
- commentary: General management commentary about performance
- other: Other explanation

RULES:
1. ONLY extract values that actually appear in the document
2. DO NOT invent or hallucinate numbers - if a metric isn't in the document, omit it
3. Separate "actuals" from "budget/plan" based on column headers
4. For source_locations, provide the page number where each metric was found
5. bbox coordinates are percentages (0-1): x=left edge, y=top edge from document
6. Preserve exact numbers from document (no rounding)
7. Convert percentages to decimals (75% → 0.75)
8. If multiple months/periods are shown (Time Series), capture them in "multi_periods"
9. IMPORTANT: Extract any text that explains WHY a number changed (e.g., "MRR decreased due to churn from X customer", "Revenue restated to exclude one-time fees", "Updated forecast based on Q3 pipeline")${guideContext}`;

    // Use the responses.create endpoint with GPT-5.1 for best extraction quality
    let response: any;
    try {
      response = await openai.responses.create({
        model: 'gpt-5.1',
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
    } catch (apiError: any) {
      // BUG FIX: Clean up uploaded file even when API call fails
      console.error('[Vision API] API call failed, cleaning up file...');
      await cleanupOpenAIFile(openai, uploadedFile.id);
      throw apiError;
    }

    // Step 3: Parse the response
    const content = response.output_text;
    console.log(`[Vision API] Response received, length: ${content?.length || 0}`);
    
    // Step 4: Clean up - delete the uploaded file
    await cleanupOpenAIFile(openai, uploadedFile.id);
    
    if (!content) {
      console.warn('[Vision API] No content returned');
      return createEmptyResult(file.filename, 'vision_no_response');
    }

    const method = mimeType.includes('pdf') ? 'pdf-vision-api' : 'excel-vision-api';
    return parseJsonResponse(content, file.filename, method);
    
  } catch (error: any) {
    console.error('[Vision API] Extraction failed:', error?.message || error);
    // Fail fast - don't degrade to fallback methods
    throw new Error(`Document extraction failed for ${file.filename}: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Helper to clean up OpenAI Files API uploads
 * Handles different SDK versions and logs errors without throwing
 */
async function cleanupOpenAIFile(openai: OpenAI, fileId: string): Promise<void> {
  try {
    const filesApi = openai.files as any;
    if (typeof filesApi.del === 'function') {
      await filesApi.del(fileId);
    } else if (typeof filesApi.delete === 'function') {
      await filesApi.delete(fileId);
    }
    console.log(`[Vision API] Cleaned up file: ${fileId}`);
  } catch (cleanupErr) {
    console.warn(`[Vision API] Failed to cleanup file ${fileId}: ${cleanupErr}`);
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

/**
 * Convert column index to Excel column letter (0 -> A, 25 -> Z, 26 -> AA, etc.)
 */
function columnIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Convert Excel column letter to index (A -> 0, Z -> 25, AA -> 26)
 */
function letterToColumnIndex(letter: string): number {
  let column = 0;
  const length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column - 1;
}

/**
 * Parse date from Excel header cell value
 * Handles: "Sep-24", "Sep 24", "September 2024", "2024-09", "09/2024", etc.
 * Returns: "2024-09-01" format or empty string if not parseable
 */
function parseDateFromHeader(headerValue: string): string {
  if (!headerValue) return '';
  
  const val = String(headerValue).trim();
  
  // Month name mappings
  const months: Record<string, string> = {
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
    'sep': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12'
  };
  
  // Pattern: "Sep-24", "Sep 24", "Sep-2024"
  const monthYearPattern = /^([a-zA-Z]+)[-\s]?(\d{2,4})$/;
  const match1 = val.match(monthYearPattern);
  if (match1) {
    const monthStr = match1[1].toLowerCase();
    let yearStr = match1[2];
    const month = months[monthStr];
    if (month) {
      // Handle 2-digit year
      if (yearStr.length === 2) {
        yearStr = parseInt(yearStr) > 50 ? `19${yearStr}` : `20${yearStr}`;
      }
      return `${yearStr}-${month}-01`;
    }
  }
  
  // Pattern: "2024-09" or "2024/09"
  const isoPattern = /^(\d{4})[-/](\d{1,2})$/;
  const match2 = val.match(isoPattern);
  if (match2) {
    const year = match2[1];
    const month = match2[2].padStart(2, '0');
    return `${year}-${month}-01`;
  }
  
  // Pattern: "09/2024" or "09-2024"
  const mmyyyyPattern = /^(\d{1,2})[-/](\d{4})$/;
  const match3 = val.match(mmyyyyPattern);
  if (match3) {
    const month = match3[1].padStart(2, '0');
    const year = match3[2];
    return `${year}-${month}-01`;
  }
  
  return '';
}

/**
 * Identify output tabs vs input/helper tabs
 * Output tabs typically have processed/consolidated data
 */
function categorizeSheets(sheetNames: string[]): { output: string[]; input: string[] } {
  const outputPatterns = [
    /chart/i, /revenue/i, /p&l/i, /pnl/i, /consolidated/i, 
    /summary/i, /dashboard/i, /output/i, /report/i, /kpi/i
  ];
  const inputPatterns = [
    /input/i, /data/i, /raw/i, /source/i, /helper/i, 
    /lookup/i, /assumption/i, /config/i
  ];
  
  const output: string[] = [];
  const input: string[] = [];
  
  for (const name of sheetNames) {
    const isOutput = outputPatterns.some(p => p.test(name));
    const isInput = inputPatterns.some(p => p.test(name));
    
    if (isOutput && !isInput) {
      output.push(name);
    } else if (isInput) {
      input.push(name);
    } else {
      // Unknown - check for common output patterns in first few chars
      output.push(name); // Default to output for safety
    }
  }
  
  return { output, input };
}

/**
 * Extract cover sheet / header context from first rows
 * This provides important context about the file structure
 */
function extractCoverSheetContext(sheets: DeterministicExcelResult['sheets']): string {
  const contextLines: string[] = [];
  
  // Check first sheet for title/context info
  if (sheets.length > 0) {
    const firstSheet = sheets[0];
    const headerRows = firstSheet.data.slice(0, 10);
    
    for (let i = 0; i < headerRows.length; i++) {
      const row = headerRows[i];
      if (!row) continue;
      
      // Look for title-like cells (non-empty, text content)
      const textCells = row.filter((cell: any) => 
        cell && typeof cell === 'string' && cell.length > 3 && !/^\d+$/.test(cell)
      );
      
      if (textCells.length > 0) {
        contextLines.push(`Row ${i + 1}: ${textCells.slice(0, 3).join(' | ')}`);
      }
    }
  }
  
  // Also check for "Actual" vs "Forecast" labels in header rows
  for (const sheet of sheets.slice(0, 4)) { // Check first 4 sheets
    const headerRows = sheet.data.slice(0, 5);
    for (let i = 0; i < headerRows.length; i++) {
      const row = headerRows[i];
      if (!row) continue;
      
      const hasActual = row.some((c: any) => /actual/i.test(String(c)));
      const hasForecast = row.some((c: any) => /forecast|budget|plan/i.test(String(c)));
      
      if (hasActual || hasForecast) {
        // Find the columns
        const actualCols: string[] = [];
        const forecastCols: string[] = [];
        
        row.forEach((cell: any, j: number) => {
          const cellStr = String(cell || '').toLowerCase();
          if (cellStr === 'actual' || cellStr === 'actuals') {
            actualCols.push(columnIndexToLetter(j));
          } else if (/forecast|budget|plan/.test(cellStr)) {
            forecastCols.push(columnIndexToLetter(j));
          }
        });
        
        if (actualCols.length > 0 || forecastCols.length > 0) {
          contextLines.push(`Sheet "${sheet.sheetName}" Row ${i + 1}: Actual columns at ${actualCols.join(',') || 'N/A'}, Forecast columns at ${forecastCols.join(',') || 'N/A'}`);
        }
      }
    }
  }
  
  return contextLines.length > 0 
    ? `\n\nCOVER SHEET CONTEXT:\n${contextLines.join('\n')}`
    : '';
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
// Local Excel Extraction (Fallback when Edge Functions unavailable)
// ============================================================================

/**
 * Local Excel extraction - used when Supabase Edge Functions are unavailable
 * Chooses between 2-phase vision-guided (local) or single-pass (serverless)
 */
async function extractExcelLocally(
  openai: OpenAI,
  excelData: DeterministicExcelResult,
  filename: string,
  guide?: PortcoGuide,
  isServerless = false
): Promise<Partial<UnifiedExtractionResult>> {
  if (isServerless) {
    // Serverless-friendly: Use Chat API only (no Assistants API due to polling timeouts)
    console.log(`[Excel] Serverless mode: Using Chat API extraction`);
    return extractExcelWithVisionGuidedChat(openai, excelData, filename, guide);
  } else {
    // Local/full environment: Use 2-phase vision-guided extraction
    console.log(`[Excel] Full mode: Using vision-guided extraction`);
    
    // Phase 1: Vision pre-scan for context
    const visionContext = await extractExcelVisionContext(openai, excelData, filename, guide);
    
    // Phase 2: Guided extraction with context hints
    return extractExcelWithContext(openai, excelData, filename, guide, visionContext);
  }
}

// ============================================================================
// Vision-Guided Excel Extraction (Vercel-Compatible)
// ============================================================================

interface VisionContext {
  sheetStructures: {
    sheetName: string;
    purpose: string; // "dashboard", "p&l", "budget", "kpis", etc.
    keyTables: {
      location: string; // "A1:F20"
      type: string; // "time_series", "summary", "detail"
      headers: string[];
    }[];
    actualColumns?: string[]; // ["B", "C", "D"]
    budgetColumns?: string[]; // ["E", "F", "G"]
    periodRow?: number;
  }[];
  charts: {
    sheetName: string;
    description: string;
    dataRange?: string;
  }[];
  overallPeriod?: string;
  currency?: string;
}

/**
 * Phase 1: Vision pre-scan to understand Excel structure
 * Identifies sheets, tables, charts, and column meanings
 */
async function extractExcelVisionContext(
  openai: OpenAI,
  excelData: DeterministicExcelResult,
  filename: string,
  guide?: PortcoGuide
): Promise<VisionContext> {
  console.log(`[Vision Context] Scanning ${excelData.sheets.length} sheets for structure...`);
  
  // Categorize sheets into output vs input
  const sheetCategories = categorizeSheets(excelData.sheets.map(s => s.sheetName));
  console.log(`[Vision Context] Output tabs: ${sheetCategories.output.join(', ')}`);
  console.log(`[Vision Context] Input tabs: ${sheetCategories.input.join(', ')}`);
  
  // Extract cover sheet context
  const coverContext = extractCoverSheetContext(excelData.sheets);
  
  // Build a visual representation of the Excel file
  // Prioritize output sheets
  let excelPreview = `EXCEL FILE: ${filename}\n`;
  excelPreview += `OUTPUT TABS (prioritize these): ${sheetCategories.output.join(', ')}\n`;
  excelPreview += `INPUT TABS (lower priority): ${sheetCategories.input.join(', ')}\n`;
  excelPreview += coverContext;
  excelPreview += '\n\n';
  
  // Process output sheets first, then input sheets
  const orderedSheets = [
    ...excelData.sheets.filter(s => sheetCategories.output.includes(s.sheetName)),
    ...excelData.sheets.filter(s => !sheetCategories.output.includes(s.sheetName))
  ];
  
  for (const sheet of orderedSheets) {
    excelPreview += `=== SHEET: ${sheet.sheetName} ===\n`;
    excelPreview += `Range: ${sheet.range}\n`;
    excelPreview += `Priority: ${sheetCategories.output.includes(sheet.sheetName) ? 'OUTPUT (high)' : 'INPUT (low)'}\n\n`;
    
    // Show first 50 rows for structure (header detection)
    const rows = sheet.data.slice(0, 50);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.some((c: any) => c !== null && c !== undefined && c !== '')) {
        const formatted = row.map((cell: any, j: number) => {
          const col = columnIndexToLetter(j);
          const val = cell !== null && cell !== undefined ? String(cell).slice(0, 20) : '';
          return `${col}${i+1}:${val}`;
        }).filter((s: string) => !s.endsWith(':')).join(' | ');
        if (formatted) excelPreview += formatted + '\n';
      }
    }
    
    // Also show LAST 30 rows (where summary/total rows often are)
    const totalRows = sheet.data.length;
    if (totalRows > 80) {
      excelPreview += `\n... (rows ${51} to ${totalRows - 30} omitted) ...\n\n`;
      excelPreview += `=== LAST 30 ROWS (Summary/Totals often here) ===\n`;
      const tailRows = sheet.data.slice(-30);
      const tailStartIdx = totalRows - 30;
      for (let i = 0; i < tailRows.length; i++) {
        const row = tailRows[i];
        if (row && row.some((c: any) => c !== null && c !== undefined && c !== '')) {
          const formatted = row.map((cell: any, j: number) => {
            const col = columnIndexToLetter(j);
            const val = cell !== null && cell !== undefined ? String(cell).slice(0, 15) : '';
            return `${col}${tailStartIdx + i + 1}:${val}`;
          }).filter((s: string) => !s.endsWith(':')).join(' | ');
          if (formatted) excelPreview += formatted + '\n';
        }
      }
    }
    excelPreview += '\n';
  }
  
  const systemPrompt = `You are analyzing an Excel file structure for financial data extraction.

TASK: Identify the structure so we can extract financial metrics accurately.

KEY FOCUS:
1. What each sheet contains (P&L, Budget, KPIs, Dashboard, Revenue Summary, etc.)
2. Where key data tables are located (including SUMMARY/TOTAL rows which are often at the bottom)
3. **CRITICAL**: Which columns contain "Actual" data vs "Budget/Forecast" data
   - Look for row labels like "Actual", "Forecast", "Budget", "Plan" in early rows
   - Note the DATE of transition (e.g., "Feb-25 is last Actual, Mar-25 is first Forecast")
4. The time periods covered and their column positions
5. Any charts and what they show

Return JSON only:
{
  "sheetStructures": [
    {
      "sheetName": "Revenue",
      "purpose": "revenue_summary",
      "isOutputTab": true,
      "keyTables": [
        { "location": "A1:Z250", "type": "time_series", "headers": ["Revenue", "MRR", "ARR"] }
      ],
      "actualColumns": ["H", "I", "J", "K", "L", "M", "N", "O"],
      "forecastColumns": ["P", "Q", "R", "S", "T", "U", "V", "W"],
      "actualEndDate": "2025-02",
      "forecastStartDate": "2025-03",
      "periodRow": 1,
      "scenarioLabelRow": 2,
      "summaryRowRange": "230-250"
    }
  ],
  "charts": [],
  "overallPeriod": "2024-2026",
  "currency": "EUR",
  "actualVsForecastTransition": {
    "lastActualColumn": "O",
    "lastActualDate": "2025-02",
    "firstForecastColumn": "P",
    "firstForecastDate": "2025-03"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast model for structure analysis
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this Excel structure:\n\n${excelPreview.slice(0, 60000)}` }
      ],
      max_tokens: 4000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    // Parse JSON from response
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    
    const context = JSON.parse(jsonStr) as VisionContext;
    console.log(`[Vision Context] Identified ${context.sheetStructures?.length || 0} sheets, ${context.charts?.length || 0} charts`);
    
    // Log actual vs forecast detection
    if ((context as any).actualVsForecastTransition) {
      const transition = (context as any).actualVsForecastTransition;
      console.log(`[Vision Context] Actual/Forecast transition: ${transition.lastActualDate} -> ${transition.firstForecastDate}`);
    }
    
    return context;
    
  } catch (error: any) {
    console.warn(`[Vision Context] Failed to extract context: ${error.message}`);
    return { sheetStructures: [], charts: [] };
  }
}

/**
 * Phase 2: Guided extraction using vision context
 * Uses the structure hints to extract precise values
 */
async function extractExcelWithContext(
  openai: OpenAI,
  excelData: DeterministicExcelResult,
  filename: string,
  guide?: PortcoGuide,
  visionContext?: VisionContext
): Promise<Partial<UnifiedExtractionResult>> {
  console.log(`[Guided Extraction] Using vision context to extract values...`);
  
  // Build extraction prompt with context hints
  let contextHints = '';
  let actualForecastHint = '';
  
  if (visionContext?.sheetStructures?.length) {
    contextHints = '\n\nVISION CONTEXT (use these hints):\n';
    for (const sheet of visionContext.sheetStructures) {
      contextHints += `- Sheet "${sheet.sheetName}": ${sheet.purpose}`;
      if ((sheet as any).isOutputTab) contextHints += ' [OUTPUT TAB - HIGH PRIORITY]';
      contextHints += '\n';
      
      if (sheet.actualColumns?.length) {
        contextHints += `  Actual data in columns: ${sheet.actualColumns.join(', ')}\n`;
      }
      if (sheet.budgetColumns?.length || (sheet as any).forecastColumns?.length) {
        const fcCols = sheet.budgetColumns || (sheet as any).forecastColumns || [];
        contextHints += `  Budget/Forecast data in columns: ${fcCols.join(', ')}\n`;
      }
      if ((sheet as any).actualEndDate) {
        contextHints += `  Last Actual period: ${(sheet as any).actualEndDate}\n`;
      }
      if ((sheet as any).forecastStartDate) {
        contextHints += `  First Forecast period: ${(sheet as any).forecastStartDate}\n`;
      }
      if ((sheet as any).summaryRowRange) {
        contextHints += `  Summary/Total rows at: ${(sheet as any).summaryRowRange}\n`;
      }
      for (const table of sheet.keyTables || []) {
        contextHints += `  Table at ${table.location}: ${table.type} with headers [${table.headers.join(', ')}]\n`;
      }
    }
    
    // Add global actual/forecast transition
    const transition = (visionContext as any).actualVsForecastTransition;
    if (transition) {
      actualForecastHint = `\n**ACTUAL vs FORECAST TRANSITION**:
- Columns up to ${transition.lastActualColumn} (${transition.lastActualDate}) = ACTUAL
- Columns from ${transition.firstForecastColumn} onwards (${transition.firstForecastDate}+) = BUDGET/FORECAST
Use this to correctly tag each period's data!\n`;
    }
  }
  
  // Categorize sheets
  const sheetCategories = categorizeSheets(excelData.sheets.map(s => s.sheetName));
  
  // Build data content - prioritize output tabs and include summary rows
  let excelContent = '';
  
  // Process output sheets first
  const orderedSheets = [
    ...excelData.sheets.filter(s => sheetCategories.output.includes(s.sheetName)),
    ...excelData.sheets.filter(s => !sheetCategories.output.includes(s.sheetName)).slice(0, 2) // Limit input sheets
  ];
  
  for (const sheet of orderedSheets) {
    excelContent += `\n=== SHEET: ${sheet.sheetName} ===\n`;
    
    const totalRows = sheet.data.length;
    
    // Include first 100 rows (headers + initial data)
    const headRows = sheet.data.slice(0, 100);
    for (let i = 0; i < headRows.length; i++) {
      const row = headRows[i];
      if (row && row.length > 0) {
        const cells = row.map((cell: any, j: number) => {
          if (cell === null || cell === undefined || cell === '') return null;
          return `${columnIndexToLetter(j)}${i + 1}:${cell}`;
        }).filter(Boolean);
        if (cells.length > 0) excelContent += cells.join(' | ') + '\n';
      }
    }
    
    // Include LAST 100 rows (where summary/totals typically are)
    if (totalRows > 200) {
      excelContent += `\n... (rows 101 to ${totalRows - 100} omitted) ...\n`;
      excelContent += `\n=== TAIL ROWS (Summary/Totals) ===\n`;
      const tailRows = sheet.data.slice(-100);
      const tailStartIdx = totalRows - 100;
      for (let i = 0; i < tailRows.length; i++) {
        const row = tailRows[i];
        if (row && row.length > 0) {
          const cells = row.map((cell: any, j: number) => {
            if (cell === null || cell === undefined || cell === '') return null;
            return `${columnIndexToLetter(j)}${tailStartIdx + i + 1}:${cell}`;
          }).filter(Boolean);
          if (cells.length > 0) excelContent += cells.join(' | ') + '\n';
        }
      }
    }
  }
  
  // Build guide context with metrics to look for
  let guideContext = '';
  if (guide) {
    guideContext = `\n\nCOMPANY CONTEXT:
Company: ${guide.company_metadata?.name || 'Unknown'}
Currency: ${guide.company_metadata?.currency || 'EUR'}`;
    
    // Add metrics to look for from guide - INJECT ALL METRICS
    const metricsMapping = (guide as any).metrics_mapping;
    if (metricsMapping && Object.keys(metricsMapping).length > 0) {
      guideContext += '\n\nMETRICS TO EXTRACT (look for these labels):';
      // Prioritize explicit metrics from guide
      for (const [metricId, config] of Object.entries(metricsMapping)) {
        const labels = (config as any).labels?.join(', ') || metricId;
        guideContext += `\n- ${metricId}: "${labels}"`;
      }
    }
  }
  
  const systemPrompt = `You are extracting financial data from an Excel file.
${contextHints}${actualForecastHint}${guideContext}

Extract ALL metrics from ALL relevant sheets and return JSON:
{
  "pageCount": 1,
  "pages": [{ "pageNumber": 1, "text": "Summary", "tables": [] }],
  "financial_summary": {
    "actuals": { "<metric_id>": <value> },
    "budget": { "<metric_id>": <value> },
    "period": "<period>",
    "currency": "${(visionContext as any)?.currency || guide?.company_metadata?.currency || 'EUR'}",
    "source_locations": {
      "<metric_id>": { "sheet": "SheetName", "cell": "B4" }
    },
    "multi_periods": [
      { 
        "period": "2024-09-01", 
        "actuals": { "mrr": 150000, "arr": 1800000, "revenue": 500000, "gross_margin": 0.75 }, 
        "budget": {},
        "source_locations": { 
          "mrr": { "sheet": "Revenue", "cell": "J29" },
          "arr": { "sheet": "Revenue", "cell": "J42" },
          "revenue": { "sheet": "P&L_consolidated", "cell": "W16" }
        }
      }
    ]
  }
}

**CRITICAL - EXTRACT FROM MULTIPLE SHEETS:**
- From REVENUE sheet: Extract MRR, ARR, customer counts for EVERY monthly column
- From P&L sheet: Extract revenue, gross_margin, cogs, net_income, monthly_burn, cash_balance for EVERY monthly column
- COMBINE metrics from both sheets into the SAME period entry in multi_periods

Standard metric IDs: mrr, arr, revenue, gross_margin, cogs, customers, customers_saas, customers_finos, monthly_burn, cash_balance, runway_months, headcount, opex, ebitda, net_income, net_retention, gross_retention, cac, ltv

CRITICAL RULES:
1. ONLY extract values present in the data - DO NOT hallucinate
2. **VERIFY COLUMN DATES**: Do NOT assume columns are contiguous. Check the date header (Row 1 or 2) for EACH column.
   - Example: If Revenue is in Col J (Jan 25) and Col L (Feb 25), skip Col K if it's empty/spacer.
3. **SHEET ALIGNMENT**: Different sheets (Revenue vs P&L) often have DIFFERENT column mappings for the same month.
   - e.g., Jan 25 might be Col J in Revenue sheet but Col P in P&L sheet. Verify headers per sheet!
4. **IMPORTANT**: Extract data for EVERY monthly column you find (typically 12-36 months). Do not summarize or truncate periods.
5. Combine data from Revenue sheet AND P&L sheet into the same period entries based on DATE, not column index.
6. **MANDATORY**: For Excel files, you MUST provide "sheet" and "cell" in source_locations for EVERY metric value inside multi_periods.
   - Example: "source_locations": { "mrr": { "sheet": "Revenue", "cell": "J29" } }
7. **ACTUAL vs BUDGET DETECTION (Dynamic)**:
   - Scan rows 1-5 for scenario labels: "Actual", "Act", "A", "Forecast", "Budget", "Plan", "Fct", "B", "Target".
   - Identify the transition column where data switches from Historical (Actuals) to Future (Budget/Forecast).
   - All columns BEFORE this transition are "actual". All columns AFTER (and including) the transition are "budget".
   - **Do NOT assume** the transition date. derive it strictly from the file headers.
8. Look for MRR and ARR totals (often in "Total" or summary rows like row 29, 42). 
   - Sanity Check: ARR should be approx 12x MRR. If ARR > 100x MRR, check units (thousands vs ones).
9. Look for ALL metrics defined in the Company Context above (e.g. junior_loan, spv_equity, etc.)`;

  try {
    // Get list of metrics from guide for coordinate mapping - include labels!
    const metricsMapping = (guide as any)?.metrics_mapping || {};
    const guideMetrics = Object.keys(metricsMapping);
    const guideMetricsWithLabels: Record<string, string[]> = {};
    
    for (const [metricId, config] of Object.entries(metricsMapping)) {
      const labels = (config as any).labels || [metricId];
      guideMetricsWithLabels[metricId] = Array.isArray(labels) ? labels : [labels];
    }
    
    console.log(`[Guided Extraction] Guide has ${guideMetrics.length} metrics defined`);
    
    // ==========================================================================
    // SYSTEMATIC COORDINATE EXTRACTION
    // 
    // Strategy:
    // 1. PHASE 1: Get column structure (dates, actual/budget) via LLM
    // 2. PHASE 2: Build row label index (NO LLM - deterministic scan)
    // 3. PHASE 3: LLM matches guide metrics to row labels (single call)
    // 4. PHASE 4: Merge column structure + row matches
    // 5. PHASE 5: Single deterministic parse
    //
    // Benefits:
    // - Complete row coverage (scans ALL rows, not samples)
    // - LLM does fuzzy matching (great at "Total MRR" → total_mrr)
    // - Column structure reused, not re-extracted
    // - Single parse at the end
    // ==========================================================================
    
    // PHASE 1: Get column structure (dates, actual/budget columns)
    console.log('[Systematic] Phase 1: Getting column structure...');
    const columnStructure = await extractExcelCoordinates(openai, excelContent, guideContext, guideMetrics, guideMetricsWithLabels);
    
    // Check what metrics the first pass found
    const firstPassMetrics = new Set<string>();
    for (const sheet of columnStructure?.sheets || []) {
      for (const metricId of Object.keys(sheet.metricRows || {})) {
        if (sheet.metricRows[metricId]) {
          firstPassMetrics.add(metricId);
        }
      }
    }
    console.log(`[Systematic] Phase 1 found ${firstPassMetrics.size} metrics with coordinates`);
    
    // PHASE 2: Build complete row label index (NO LLM)
    console.log('[Systematic] Phase 2: Building row label index (no LLM)...');
    const rowIndex = buildRowLabelIndex(excelData);
    
    // PHASE 3: LLM matches guide metrics to row labels
    const missingMetrics = guideMetrics.filter(m => !firstPassMetrics.has(m));
    let finalCoords = columnStructure;
    
    if (missingMetrics.length > 0 && rowIndex.length > 0) {
      console.log(`[Systematic] Phase 3: Matching ${missingMetrics.length} missing metrics to ${rowIndex.length} row labels...`);
      
      try {
        const labelMatches = await matchMetricsToRowLabels(
          openai, 
          missingMetrics, 
          guideMetricsWithLabels, 
          rowIndex
        );
        
        if (Object.keys(labelMatches).length > 0) {
          // PHASE 4: Build coordinate map from matches + column structure
          console.log('[Systematic] Phase 4: Merging label matches with column structure...');
          finalCoords = buildCoordinateMapFromMatches(labelMatches, columnStructure);
          
          // Count total metrics now
          const totalMetrics = new Set<string>();
          for (const sheet of finalCoords.sheets || []) {
            for (const metricId of Object.keys(sheet.metricRows || {})) {
              if (sheet.metricRows[metricId]) totalMetrics.add(metricId);
            }
          }
          console.log(`[Systematic] Total metrics with coordinates: ${totalMetrics.size}`);
        }
      } catch (err: any) {
        console.warn(`[Systematic] Phase 3 failed: ${err?.message}, using first pass only`);
      }
    } else {
      console.log(`[Systematic] Phase 3 skipped: ${missingMetrics.length} missing, ${rowIndex.length} labels`);
    }
    
    // PHASE 5: Single deterministic parse
    const hasAnyCoords = finalCoords?.sheets?.length > 0;
    
    if (hasAnyCoords) {
      console.log('[Systematic] Phase 5: Deterministic parse with final coordinates...');
      const coordResult = extractFromCoordinateMap(finalCoords, excelData, filename);
      
      const periodCount = coordResult.financial_summary?.multi_periods?.length || 0;
      const valueCount = coordResult.financial_summary?.multi_periods?.reduce(
        (sum, p) => sum + Object.keys(p.actuals || {}).length + Object.keys(p.budget || {}).length, 0
      ) || 0;
      
      console.log(`[Systematic] ✓ Complete: ${periodCount} periods, ${valueCount} values`);
      
      if (valueCount > 0) {
        return coordResult;
      }
      
      console.log(`[Systematic] Coordinate extraction empty, trying LLM fallback...`);
    } else {
      console.log('[Systematic] No coordinate map, using LLM extraction fallback');
    }

    // Fallback: LLM Extraction (only if coordinate extraction returned nothing)
    console.log('[Guided Extraction] Running LLM extraction as last resort...');
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract financial data:\n\n${excelContent.slice(0, 100000)}` }
      ],
      max_completion_tokens: 16000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createEmptyResult(filename, 'guided_extraction_no_response');
    }

    console.log(`[Guided Extraction] Response received, length: ${content.length}`);
    const result = parseJsonResponse(content, filename, 'excel-vision-guided');

    // Phase 3: Deterministic Patch (The "Miner")
    // Use EXPLICIT actualColumns and budgetColumns lists - no guessing!
    if (coords?.sheets?.length > 0 && result.financial_summary?.multi_periods) {
      console.log(`[Coordinates] Patching values using explicit actual/budget column lists...`);
      
      for (const sheetMap of coords.sheets) {
        const sheet = excelData.sheets.find(s => s.sheetName === sheetMap.sheetName);
        if (!sheet) continue;

        // Get explicit column lists
        const actualColumns = new Set(sheetMap.actualColumns || []);
        const budgetColumns = new Set(sheetMap.budgetColumns || []);
        const columnDates = sheetMap.columnDates || sheetMap.dateColumns || {};
        
        console.log(`[Patch] ${sheetMap.sheetName}: Processing ${actualColumns.size} actual cols, ${budgetColumns.size} budget cols`);

        // Iterate through extracted periods
        const periods: any[] = result.financial_summary.multi_periods;
        for (const period of periods) {
          const date = period.period;
          
          // Find column for this date (reverse lookup from columnDates)
          let colLetter: string | undefined;
          for (const [col, colDate] of Object.entries(columnDates)) {
            if (colDate === date) {
              colLetter = col;
              break;
            }
          }
          
          if (!colLetter) continue;
          
          const colIdx = letterToColumnIndex(colLetter);
          
          // EXPLICIT classification - column is in ONE list or the other
          const isActualColumn = actualColumns.has(colLetter);
          const isBudgetColumn = budgetColumns.has(colLetter);
          
          if (!isActualColumn && !isBudgetColumn) {
            // Column not classified - skip patching for this date
            continue;
          }
          
          // Get all metrics to patch
          const allMetrics = new Set([
            ...Object.keys(period.actuals || {}),
            ...Object.keys(period.budget || {}),
            ...Object.keys(sheetMap.metricRows || {})
          ]);
          
          for (const metric of allMetrics) {
            const rowIdx = sheetMap.metricRows?.[metric];
            if (!rowIdx) continue;
            
            // Read value deterministically from Excel
            const cellValue = sheet.data[rowIdx - 1]?.[colIdx];
            if (cellValue === undefined || typeof cellValue !== 'number') continue;
            
            // CLEAN classification - no ambiguity
            if (isActualColumn) {
              // This column is EXPLICITLY an Actual column
              if (!period.actuals) period.actuals = {};
              period.actuals[metric] = cellValue;
              // Ensure it's NOT in budget
              if (period.budget?.[metric] !== undefined) {
                delete period.budget[metric];
              }
            } else if (isBudgetColumn) {
              // This column is EXPLICITLY a Budget column
              if (!period.budget) period.budget = {};
              period.budget[metric] = cellValue;
              // Ensure it's NOT in actuals
              if (period.actuals?.[metric] !== undefined) {
                delete period.actuals[metric];
              }
            }
            
            // Update source location
            if (!period.source_locations) period.source_locations = {};
            period.source_locations[metric] = {
              sheet: sheetMap.sheetName,
              cell: `${colLetter}${rowIdx}`
            };
          }
        }
      }
    }

    return result;
    
  } catch (error: any) {
    console.error('[Guided Extraction] Failed:', error?.message);
    throw error;
  }
}

/**
 * Coordinate-based extraction helper
 * Asks LLM to map the grid (Sheet, Row, Col) instead of reading values
 */
async function extractExcelCoordinates(
  openai: OpenAI,
  excelContent: string,
  guideContext: string,
  guideMetrics: string[] = [],
  guideMetricsWithLabels?: Record<string, string[]>
): Promise<any> {
  console.log('[Coordinates] Starting comprehensive grid mapping...');
  
  // Build explicit metric list from guide with BOTH IDs and labels
  let metricList = '';
  if (guideMetricsWithLabels && Object.keys(guideMetricsWithLabels).length > 0) {
    // Include labels so LLM can match row text
    const entries = Object.entries(guideMetricsWithLabels);
    metricList = entries.map(([id, labels]) => 
      `${id} (look for: "${labels.slice(0, 2).join('", "')}")`
    ).join('\n  - ');
    metricList = '- ' + metricList;
    console.log(`[Coordinates] Injecting ${entries.length} metrics with labels from guide`);
  } else if (guideMetrics.length > 0) {
    metricList = guideMetrics.join(', ');
  } else {
    metricList = 'mrr, arr, revenue, gross_margin, cogs, customers, customers_saas, customers_finos, monthly_burn, cash_balance, runway_months, headcount, opex, ebitda, net_income, gross_retention, net_retention, cac, ltv, arpu, churn';
  }

  const systemPrompt = `You are a forensic Excel analyst building a COMPLETE coordinate map for financial data extraction.

**YOUR TASK**: Create a precise map of WHERE every metric lives in this spreadsheet.
The extraction code will use YOUR coordinates to read values directly - accuracy is critical.

**OUTPUT FORMAT** (JSON):
{
  "sheets": [
    {
      "sheetName": "Revenue",
      "dateHeaderRow": 1,
      "scenarioLabelRow": 2,
      "metricRows": {
        "mrr": 29,
        "arr": 42,
        "customers": 17,
        "total_actual_mrr": 29,
        "actual_saas_mrr": 30
      },
      "actualColumns": ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      "budgetColumns": ["P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB"],
      "columnDates": {
        "D": "2024-03-01",
        "E": "2024-04-01",
        "F": "2024-05-01",
        "G": "2024-06-01",
        "H": "2024-07-01",
        "I": "2024-08-01",
        "J": "2024-09-01",
        "K": "2024-10-01",
        "L": "2024-11-01",
        "M": "2024-12-01",
        "N": "2025-01-01",
        "O": "2025-02-01"
      }
    },
    {
      "sheetName": "P&L_consolidated",
      "dateHeaderRow": 1,
      "scenarioLabelRow": 2,
      "metricRows": {
        "revenue": 16,
        "gross_margin": 29,
        "cogs": 27,
        "opex": 38,
        "monthly_burn_net": 97,
        "cash_balance_os": 88
      },
      "actualColumns": ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      "budgetColumns": ["P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA"],
      "columnDates": {
        "D": "2024-03-01",
        "E": "2024-04-01",
        "J": "2024-09-01",
        "K": "2024-10-01",
        "P": "2025-03-01"
      }
    }
  ]
}

**METRICS TO FIND** (search for these in row labels):
${metricList}

**METRIC SEARCH STRATEGY:**
1. Look for TOTAL or SUMMARY rows (e.g., "Total MRR", "MRR Total", "Revenue - Total")
2. Look for section headers followed by detail rows
3. Common patterns:
   - MRR often near row 20-35 in Revenue sheets
   - ARR often near row 40-50 (may be calculated as MRR * 12)
   - Revenue often near row 10-20 in P&L sheets
   - Cash Balance often near row 80-100

**DATE COLUMN DETECTION (CRITICAL FOR ACCURACY):**
1. Find the row with month headers (usually row 1, look for patterns like "Mar-24", "Apr-24", etc.)
2. **DATA DOES NOT START AT COLUMN A OR B** - scan to find where date columns actually begin!
   - Example: If row 1 shows D1:"Mar-24", E1:"Apr-24", F1:"May-24"... data starts at column D, not A/B
3. Map EVERY column with a date to columnDates using the EXACT column letter from the data:
   - D1:"Mar-24" → columnDates["D"] = "2024-03-01"
   - E1:"Apr-24" → columnDates["E"] = "2024-04-01"
   - J1:"Sep-24" → columnDates["J"] = "2024-09-01"
4. Date format conversion:
   - "Mar-24" → "2024-03-01", "Sep-24" → "2024-09-01", "Jan-25" → "2025-01-01"
5. **VERIFY**: Read the cell reference (e.g., "J1:Sep-24") and use THAT column letter (J), not an offset!

**ACTUAL vs BUDGET COLUMN DETECTION:**
1. Find the scenario label row (usually row 1 or 2)
2. Look for: "Actual", "Actuals", "Act", "A" → those columns are actualColumns
3. Look for: "Budget", "Forecast", "Plan", "Fct", "B", "Target" → those columns are budgetColumns
4. List ALL columns in each category - don't truncate!

**CRITICAL RULES:**
1. Include EVERY date column you find (typically 12-36 months)
2. Include EVERY metric you can find from the list above
3. Row numbers are 1-based (as shown in Excel)
4. If a metric appears on multiple sheets, include it in each sheet's metricRows
5. If unsure about a metric row, include your best guess - it's better to have it than miss it

${guideContext}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Build complete coordinate map for:\n\n${excelContent.slice(0, 60000)}` }
      ],
      max_completion_tokens: 8000
    });

    const jsonStr = response.choices[0]?.message?.content || '{}';
    console.log(`[Coordinates] Raw response length: ${jsonStr.length}`);
    
    // Cleanup and parse
    let cleanJson = jsonStr.replace(/```json|```/g, '').trim();
    // Fix common JSON issues
    cleanJson = cleanJson.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    
    const parsed = JSON.parse(cleanJson);
    console.log(`[Coordinates] Mapped ${parsed.sheets?.length || 0} sheets`);
    
    // Detailed logging
    for (const sheet of parsed.sheets || []) {
      const actualCount = sheet.actualColumns?.length || 0;
      const budgetCount = sheet.budgetColumns?.length || 0;
      const dateCount = Object.keys(sheet.columnDates || {}).length;
      const metricCount = Object.keys(sheet.metricRows || {}).filter(k => sheet.metricRows[k]).length;
      
      console.log(`[Coordinates] ${sheet.sheetName}:`);
      console.log(`[Coordinates]   - ${metricCount} metrics: ${Object.keys(sheet.metricRows || {}).filter(k => sheet.metricRows[k]).join(', ')}`);
      console.log(`[Coordinates]   - ${dateCount} date columns mapped`);
      console.log(`[Coordinates]   - ${actualCount} actual cols, ${budgetCount} budget cols`);
    }
    
    return parsed;
  } catch (e: any) {
    console.error('[Coordinates] Mapping failed:', e.message);
    return { sheets: [] };
  }
}

/**
 * COORDINATE-FIRST EXTRACTION
 * Reads values directly from Excel cells using the coordinate map.
 * NO LLM involved in value extraction - 100% deterministic.
 */
function extractFromCoordinateMap(
  coords: any,
  excelData: DeterministicExcelResult,
  filename: string
): Partial<UnifiedExtractionResult> {
  console.log('[Coordinate Extract] Building result from coordinate map...');
  
  // Build a map of date -> period data
  const periodMap = new Map<string, {
    actuals: Record<string, number>;
    budget: Record<string, number>;
    source_locations: Record<string, { sheet: string; cell: string }>;
  }>();
  
  let totalExtracted = 0;
  
  for (const sheetCoord of coords.sheets || []) {
    const sheet = excelData.sheets.find(s => s.sheetName === sheetCoord.sheetName);
    if (!sheet) {
      console.warn(`[Coordinate Extract] Sheet not found: ${sheetCoord.sheetName}`);
      continue;
    }
    
    const actualColumns = sheetCoord.actualColumns || [];
    const budgetColumns = sheetCoord.budgetColumns || [];
    const columnDates = sheetCoord.columnDates || {};
    const metricRows = sheetCoord.metricRows || {};
    const dateHeaderRow = sheetCoord.dateHeaderRow || 1;
    
    // Combine all columns to process
    const allColumns = [...actualColumns, ...budgetColumns];
    const actualSet = new Set(actualColumns);
    const budgetSet = new Set(budgetColumns);
    
    console.log(`[Coordinate Extract] Processing ${sheetCoord.sheetName}:`);
    console.log(`[Coordinate Extract]   - ${allColumns.length} total columns (${actualColumns.length} actual, ${budgetColumns.length} budget)`);
    console.log(`[Coordinate Extract]   - ${Object.keys(columnDates).length} dates mapped`);
    console.log(`[Coordinate Extract]   - ${Object.keys(metricRows).filter(k => metricRows[k]).length} metrics`);
    
    // For each column in actual or budget lists
    for (const colLetter of allColumns) {
      const colIdx = letterToColumnIndex(colLetter);
      const isActual = actualSet.has(colLetter);
      const isBudget = budgetSet.has(colLetter);
      
      // Try to get date from columnDates, or read from header row
      let dateStr = columnDates[colLetter];
      
      if (!dateStr) {
        // Try to read date from header row
        const headerCell = sheet.data[dateHeaderRow - 1]?.[colIdx];
        if (headerCell) {
          dateStr = parseDateFromHeader(String(headerCell));
        }
      }
      
      if (!dateStr) {
        // Still no date - skip this column
        continue;
      }
      
      // Get or create period entry
      if (!periodMap.has(dateStr)) {
        periodMap.set(dateStr, {
          actuals: {},
          budget: {},
          source_locations: {}
        });
      }
      const period = periodMap.get(dateStr)!;
      
      // For each metric
      for (const [metricId, rowNum] of Object.entries(metricRows)) {
        if (!rowNum || typeof rowNum !== 'number') continue;
        
        // Read value directly from cell
        const rowIdx = rowNum - 1; // Convert to 0-based
        const cellValue = sheet.data[rowIdx]?.[colIdx];
        
        // Skip if not a number
        if (cellValue === undefined || cellValue === null || cellValue === '') continue;
        const numValue = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue));
        if (isNaN(numValue)) continue;
        
        // Store in appropriate bucket
        if (isActual) {
          period.actuals[metricId] = numValue;
        } else if (isBudget) {
          period.budget[metricId] = numValue;
        }
        
        // Store source location
        period.source_locations[metricId] = {
          sheet: sheetCoord.sheetName,
          cell: `${colLetter}${rowNum}`
        };
        
        totalExtracted++;
      }
    }
  }
  
  // Convert to multi_periods array
  const multiPeriods = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      period: date,
      actuals: data.actuals,
      budget: data.budget,
      source_locations: data.source_locations
    }));
  
  console.log(`[Coordinate Extract] Complete: ${multiPeriods.length} periods, ${totalExtracted} total values`);
  
  // Log breakdown
  const actualCount = multiPeriods.reduce((sum, p) => sum + Object.keys(p.actuals).length, 0);
  const budgetCount = multiPeriods.reduce((sum, p) => sum + Object.keys(p.budget).length, 0);
  console.log(`[Coordinate Extract] Actuals: ${actualCount}, Budget: ${budgetCount}`);
  
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, text: 'Coordinate-based extraction', tables: [] }],
    fullText: 'Excel',
    fileType: 'xlsx',
    financial_summary: {
      actuals: {},
      budget: {},
      period: multiPeriods[0]?.period || '',
      currency: 'EUR',
      source_locations: {},
      multi_periods: multiPeriods
    },
  } as Partial<UnifiedExtractionResult>;
}

// =============================================================================
// SYSTEMATIC ROW LABEL EXTRACTION (No LLM - Pure Scanning)
// =============================================================================

interface RowLabelEntry {
  sheet: string;
  row: number;
  label: string;
  labelColumn: string; // A, B, or C
}

/**
 * PHASE 1: Build complete row label index from ALL sheets
 * Scans columns A, B, C for text labels that could be metric names
 * No LLM involved - pure deterministic scanning
 */
function buildRowLabelIndex(excelData: DeterministicExcelResult): RowLabelEntry[] {
  console.log('[Row Index] Building complete row label index...');
  
  const index: RowLabelEntry[] = [];
  const labelColumns = [0, 1, 2]; // A, B, C - where metric labels typically are
  
  for (const sheet of excelData.sheets) {
    // Skip chart/non-data sheets
    const sheetLower = sheet.sheetName.toLowerCase();
    if (sheetLower.includes('chart') || sheetLower === 'charts') continue;
    
    for (let rowIdx = 0; rowIdx < sheet.data.length; rowIdx++) {
      const row = sheet.data[rowIdx];
      if (!row) continue;
      
      // Check columns A, B, C for potential labels
      for (const colIdx of labelColumns) {
        const cell = row[colIdx];
        if (!cell) continue;
        
        const cellStr = String(cell).trim();
        
        // Skip if:
        // - Empty or too short
        // - Pure numbers (likely data, not labels)
        // - Dates
        // - Too long (likely descriptions, not labels)
        if (cellStr.length < 2 || cellStr.length > 80) continue;
        if (/^[\d.,\-+%€$£¥()]+$/.test(cellStr)) continue; // Pure numbers/currency
        if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(cellStr)) continue; // Dates
        if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(cellStr)) continue; // Month headers
        
        // This looks like a potential label
        index.push({
          sheet: sheet.sheetName,
          row: rowIdx + 1, // 1-based row number
          label: cellStr,
          labelColumn: columnIndexToLetter(colIdx)
        });
      }
    }
  }
  
  console.log(`[Row Index] Found ${index.length} potential row labels across ${excelData.sheets.length} sheets`);
  return index;
}

/**
 * PHASE 2: LLM matches guide metrics to row labels
 * Single focused LLM call for fuzzy matching
 */
async function matchMetricsToRowLabels(
  openai: OpenAI,
  guideMetrics: string[],
  guideMetricsWithLabels: Record<string, string[]>,
  rowIndex: RowLabelEntry[]
): Promise<Record<string, { sheet: string; row: number }>> {
  console.log(`[Label Match] Matching ${guideMetrics.length} guide metrics to ${rowIndex.length} row labels...`);
  
  // Build compact representation of row labels (group by sheet)
  const labelsBySheet: Record<string, { row: number; label: string }[]> = {};
  for (const entry of rowIndex) {
    if (!labelsBySheet[entry.sheet]) labelsBySheet[entry.sheet] = [];
    labelsBySheet[entry.sheet].push({ row: entry.row, label: entry.label });
  }
  
  // Build the label index string for LLM
  let labelIndex = '';
  for (const [sheet, labels] of Object.entries(labelsBySheet)) {
    labelIndex += `\n=== ${sheet} ===\n`;
    // Dedupe and limit per sheet to avoid token explosion
    const seen = new Set<string>();
    let count = 0;
    for (const { row, label } of labels) {
      const key = label.toLowerCase().slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      labelIndex += `Row ${row}: "${label}"\n`;
      count++;
      if (count > 150) { // Limit per sheet
        labelIndex += `... (${labels.length - count} more rows)\n`;
        break;
      }
    }
  }
  
  // Build metric search list with aliases
  let metricsToMatch = 'METRICS TO FIND (with aliases):\n';
  for (const metricId of guideMetrics) {
    const aliases = guideMetricsWithLabels[metricId] || [metricId];
    metricsToMatch += `- ${metricId}: "${aliases.join('", "')}"\n`;
  }
  
  const systemPrompt = `You are matching financial metric IDs to row labels in an Excel file.

${metricsToMatch}

Your task: For each metric, find the BEST matching row label from the index below.

MATCHING RULES:
1. Match by meaning, not exact text (e.g., "Total actual MRR" matches "total_actual_mrr")
2. Prefer rows with financial data (rows 10-200 typically have data)
3. If multiple matches exist, prefer the one that looks like a "total" or "summary" row
4. If no good match exists, skip that metric (don't guess)

Return JSON:
{
  "matches": {
    "metric_id": { "sheet": "SheetName", "row": 29 },
    "another_metric": { "sheet": "P&L_consolidated", "row": 85 },
    ...
  }
}

ONLY include metrics you found good matches for. Quality over quantity.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Match metrics to row labels:\n\n${labelIndex.slice(0, 60000)}` }
      ],
      max_completion_tokens: 4000
    });

    const jsonStr = response.choices[0]?.message?.content || '{}';
    const cleanJson = jsonStr.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    const matches = parsed.matches || {};
    console.log(`[Label Match] Found ${Object.keys(matches).length} metric-to-row matches`);
    
    // Log matches for debugging
    for (const [metric, loc] of Object.entries(matches).slice(0, 10)) {
      const locTyped = loc as { sheet: string; row: number };
      console.log(`[Label Match]   ${metric} → ${locTyped.sheet}!row${locTyped.row}`);
    }
    
    return matches;
    
  } catch (e: any) {
    console.error('[Label Match] Failed:', e.message);
    return {};
  }
}

/**
 * Merge label matches with column structure to create complete coordinate map
 */
function buildCoordinateMapFromMatches(
  metricMatches: Record<string, { sheet: string; row: number }>,
  columnStructure: any // First pass coords with columnDates, actualColumns, budgetColumns
): any {
  console.log('[Coord Build] Building coordinate map from label matches...');
  
  // Group matches by sheet
  const sheetMetrics: Record<string, Record<string, number>> = {};
  for (const [metricId, loc] of Object.entries(metricMatches)) {
    if (!sheetMetrics[loc.sheet]) sheetMetrics[loc.sheet] = {};
    sheetMetrics[loc.sheet][metricId] = loc.row;
  }
  
  // Build coordinate map
  const sheets: any[] = [];
  
  for (const [sheetName, metricRows] of Object.entries(sheetMetrics)) {
    // Find column structure for this sheet (from first pass)
    const existingSheet = columnStructure?.sheets?.find((s: any) => s.sheetName === sheetName);
    
    sheets.push({
      sheetName,
      metricRows,
      dateHeaderRow: existingSheet?.dateHeaderRow || 1,
      columnDates: existingSheet?.columnDates || {},
      actualColumns: existingSheet?.actualColumns || [],
      budgetColumns: existingSheet?.budgetColumns || []
    });
  }
  
  // Also include sheets from first pass that have column structure but maybe different metrics
  for (const existingSheet of columnStructure?.sheets || []) {
    if (!sheetMetrics[existingSheet.sheetName]) {
      sheets.push(existingSheet);
    } else {
      // Merge metrics from first pass into our match-based sheet
      const targetSheet = sheets.find(s => s.sheetName === existingSheet.sheetName);
      if (targetSheet) {
        targetSheet.metricRows = {
          ...existingSheet.metricRows,
          ...targetSheet.metricRows // Match-based takes precedence
        };
        // Use first pass column structure if ours is empty
        if (!targetSheet.columnDates || Object.keys(targetSheet.columnDates).length === 0) {
          targetSheet.columnDates = existingSheet.columnDates;
        }
        if (!targetSheet.actualColumns?.length) {
          targetSheet.actualColumns = existingSheet.actualColumns;
        }
        if (!targetSheet.budgetColumns?.length) {
          targetSheet.budgetColumns = existingSheet.budgetColumns;
        }
      }
    }
  }
  
  console.log(`[Coord Build] Built coordinate map with ${sheets.length} sheets`);
  return { sheets };
}

// =============================================================================
// LEGACY FUNCTIONS (kept for fallback)
// =============================================================================

/**
 * Build EXPANDED Excel content for second pass search
 * Includes ALL sheets and MORE rows to find metrics missed in first pass
 */
function buildExpandedExcelContent(
  excelData: DeterministicExcelResult,
  missingMetrics: string[]
): string {
  let content = '=== EXPANDED SEARCH (ALL SHEETS, MORE ROWS) ===\n\n';
  
  // Categorize missing metrics to prioritize relevant sheets
  const metricHints: Record<string, string[]> = {
    'Balance Sheet': ['cash', 'balance', 'asset', 'liability', 'equity', 'debt', 'loan'],
    'P&L': ['revenue', 'cost', 'margin', 'ebitda', 'income', 'expense', 'opex', 'burn'],
    'Revenue': ['mrr', 'arr', 'customer', 'churn', 'retention', 'subscription'],
    'Cover': ['runway', 'headcount', 'kpi', 'summary', 'highlight'],
    'Assumptions': ['growth', 'rate', 'assumption', 'input'],
  };
  
  // Find which sheet types might have our missing metrics
  const prioritySheets = new Set<string>();
  for (const metric of missingMetrics) {
    const metricLower = metric.toLowerCase();
    for (const [sheetType, keywords] of Object.entries(metricHints)) {
      if (keywords.some(kw => metricLower.includes(kw))) {
        prioritySheets.add(sheetType);
      }
    }
  }
  
  content += `Looking for: ${missingMetrics.slice(0, 10).join(', ')}...\n`;
  content += `Priority sheet types: ${[...prioritySheets].join(', ') || 'All'}\n\n`;
  
  // Process ALL sheets (not just output tabs)
  for (const sheet of excelData.sheets) {
    const sheetNameLower = sheet.sheetName.toLowerCase();
    
    // Skip obvious non-data sheets
    if (sheetNameLower.includes('chart') || sheetNameLower === 'charts') continue;
    
    content += `\n=== SHEET: ${sheet.sheetName} ===\n`;
    
    const totalRows = sheet.data.length;
    const maxRows = 200; // More rows than first pass (was 100)
    
    // Include first 200 rows (or all if smaller)
    const headRows = sheet.data.slice(0, maxRows);
    for (let i = 0; i < headRows.length; i++) {
      const row = headRows[i];
      if (row && row.length > 0) {
        const cells = row.map((cell: any, j: number) => {
          if (cell === null || cell === undefined || cell === '') return null;
          return `${columnIndexToLetter(j)}${i + 1}:${String(cell).slice(0, 20)}`;
        }).filter(Boolean);
        if (cells.length > 0) content += cells.join(' | ') + '\n';
      }
    }
    
    // If sheet has more rows, include MIDDLE section (often missed!)
    if (totalRows > maxRows * 2) {
      const midStart = Math.floor(totalRows / 3);
      const midEnd = Math.floor(totalRows * 2 / 3);
      const midSample = 50; // Sample 50 rows from middle
      
      content += `\n... (middle section rows ${midStart}-${midEnd}) ...\n`;
      const midRows = sheet.data.slice(midStart, midStart + midSample);
      for (let i = 0; i < midRows.length; i++) {
        const row = midRows[i];
        if (row && row.length > 0) {
          const cells = row.map((cell: any, j: number) => {
            if (cell === null || cell === undefined || cell === '') return null;
            return `${columnIndexToLetter(j)}${midStart + i + 1}:${String(cell).slice(0, 20)}`;
          }).filter(Boolean);
          if (cells.length > 0) content += cells.join(' | ') + '\n';
        }
      }
    }
    
    // Include last 100 rows (summary/totals)
    if (totalRows > maxRows) {
      content += `\n=== TAIL ROWS (${totalRows - 100} to ${totalRows}) ===\n`;
      const tailRows = sheet.data.slice(-100);
      const tailStart = totalRows - 100;
      for (let i = 0; i < tailRows.length; i++) {
        const row = tailRows[i];
        if (row && row.length > 0) {
          const cells = row.map((cell: any, j: number) => {
            if (cell === null || cell === undefined || cell === '') return null;
            return `${columnIndexToLetter(j)}${tailStart + i + 1}:${String(cell).slice(0, 20)}`;
          }).filter(Boolean);
          if (cells.length > 0) content += cells.join(' | ') + '\n';
        }
      }
    }
  }
  
  return content;
}

/**
 * Second Pass Coordinate Extraction - Targeted search for missing metrics
 * Returns ONLY coordinates, not parsed values. Parsing happens once with merged coords.
 */
async function extractMissingMetricCoordinates(
  openai: OpenAI,
  excelContent: string,
  missingMetrics: string[],
  guideMetricsWithLabels?: Record<string, string[]>,
  firstPassCoords?: any
): Promise<any> {
  console.log(`[Second Pass Coords] Searching for ${missingMetrics.length} missing metric coordinates...`);
  
  // Build focused prompt for missing metrics
  let metricsToFind = '\nMISSING METRICS TO FIND (search for these specific row labels):\n';
  for (const metricId of missingMetrics.slice(0, 25)) { // Limit to 25 for context size
    const labels = guideMetricsWithLabels?.[metricId] || [metricId];
    metricsToFind += `- ${metricId}: "${labels.join('" or "')}"\n`;
  }
  
  // Get column structure from first pass to reuse
  const firstSheet = firstPassCoords?.sheets?.[0];
  const knownColumnDates = firstSheet?.columnDates ? JSON.stringify(firstSheet.columnDates) : '{}';
  const knownActualCols = firstSheet?.actualColumns?.join(', ') || '';
  const knownBudgetCols = firstSheet?.budgetColumns?.join(', ') || '';
  
  const systemPrompt = `You are doing an EXPANDED SEARCH for financial metrics that were missed in a first-pass extraction.

This search includes:
- ALL sheets (not just output tabs)
- MORE rows per sheet (including middle sections that were truncated)
- Priority sheets based on metric types

${metricsToFind}

**REUSE THIS COLUMN STRUCTURE FROM FIRST PASS:**
- Column dates: ${knownColumnDates}
- Actual columns: ${knownActualCols}
- Budget columns: ${knownBudgetCols}

Your job is to find the ROW NUMBERS for the missing metrics. The column structure is already known.

**WHERE TO LOOK:**
- cash_balance, assets, liabilities → Balance Sheet, P&L tail rows
- runway_months, headcount → Cover sheet, Summary sections  
- monthly_burn, net_income → P&L consolidated, middle/tail rows
- customer counts, churn → Revenue sheet, Customer sections
- loan, equity, spv → Balance Sheet, Financing sections

Return JSON format:
{
  "sheets": [
    {
      "sheetName": "P&L_consolidated",
      "metricRows": {
        "cash_balance": 85,
        "monthly_burn": 42,
        "runway_months": 90
      },
      "dateHeaderRow": 1,
      "columnDates": { ... copy from first pass ... },
      "actualColumns": [ ... copy from first pass ... ],
      "budgetColumns": [ ... copy from first pass ... ]
    }
  ]
}

IMPORTANT: 
- Search EVERY sheet in the expanded content
- Check MIDDLE rows (row 100-200) where metrics are often hidden
- Check TAIL rows (summaries, totals)
- ONLY return metricRows for the MISSING metrics listed above`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `EXPANDED SEARCH - Find ROW NUMBERS for missing metrics:\n\n${excelContent.slice(0, 80000)}` }
      ],
      max_completion_tokens: 6000
    });

    const jsonStr = response.choices[0]?.message?.content || '{}';
    const cleanJson = jsonStr.replace(/```json|```/g, '').trim();
    const coords = JSON.parse(cleanJson);
    
    const foundCount = (coords.sheets || []).reduce(
      (sum: number, s: any) => sum + Object.keys(s.metricRows || {}).filter(k => s.metricRows[k]).length, 0
    );
    
    console.log(`[Second Pass Coords] Found coordinates for ${foundCount} additional metrics`);
    return coords;
    
  } catch (e: any) {
    console.error('[Second Pass Coords] Failed:', e.message);
    return { sheets: [] };
  }
}

/**
 * Merge two coordinate maps without parsing
 * Combines metricRows from both passes, keeps column structure from first pass
 */
function mergeCoordinateMaps(first: any, second: any): any {
  if (!first?.sheets?.length) return second;
  if (!second?.sheets?.length) return first;
  
  // Create a map of sheet name -> merged sheet data
  const sheetMap = new Map<string, any>();
  
  // Add all first pass sheets
  for (const sheet of first.sheets) {
    sheetMap.set(sheet.sheetName, { ...sheet });
  }
  
  // Merge second pass sheets
  for (const secondSheet of second.sheets) {
    const existing = sheetMap.get(secondSheet.sheetName);
    
    if (existing) {
      // Merge metricRows (second pass adds new metrics)
      const mergedMetricRows = { ...existing.metricRows };
      for (const [metricId, rowNum] of Object.entries(secondSheet.metricRows || {})) {
        if (rowNum && !mergedMetricRows[metricId]) {
          mergedMetricRows[metricId] = rowNum;
        }
      }
      existing.metricRows = mergedMetricRows;
      
      // Keep column structure from first pass (more reliable)
      // But if first pass was missing columns, use second pass
      if (!existing.columnDates && secondSheet.columnDates) {
        existing.columnDates = secondSheet.columnDates;
      }
      if (!existing.actualColumns?.length && secondSheet.actualColumns?.length) {
        existing.actualColumns = secondSheet.actualColumns;
      }
      if (!existing.budgetColumns?.length && secondSheet.budgetColumns?.length) {
        existing.budgetColumns = secondSheet.budgetColumns;
      }
    } else {
      // New sheet from second pass
      sheetMap.set(secondSheet.sheetName, { ...secondSheet });
    }
  }
  
  const merged = { sheets: Array.from(sheetMap.values()) };
  
  console.log(`[Merge Coords] Combined ${first.sheets.length} + ${second.sheets.length} sheets → ${merged.sheets.length} total`);
  
  return merged;
}

/**
 * Merge multi_periods from two extraction results
 * Combines actuals, budget, and source_locations by period
 */
function mergeMultiPeriods(
  base: UnifiedExtractionResult['financial_summary'],
  addition: UnifiedExtractionResult['financial_summary'] | undefined
): UnifiedExtractionResult['financial_summary'] {
  if (!addition?.multi_periods?.length) return base;
  if (!base?.multi_periods?.length) return addition;
  
  // Create a map of periods for efficient merging
  const periodMap = new Map<string, any>();
  
  // Add base periods
  for (const period of base.multi_periods) {
    periodMap.set(period.period, { ...period });
  }
  
  // Merge addition periods
  for (const addPeriod of addition.multi_periods) {
    const existing = periodMap.get(addPeriod.period);
    
    if (existing) {
      // Merge actuals (don't overwrite existing)
      for (const [metric, value] of Object.entries(addPeriod.actuals || {})) {
        if (existing.actuals?.[metric] === undefined) {
          if (!existing.actuals) existing.actuals = {};
          existing.actuals[metric] = value;
        }
      }
      
      // Merge budget (don't overwrite existing)
      for (const [metric, value] of Object.entries(addPeriod.budget || {})) {
        if (existing.budget?.[metric] === undefined) {
          if (!existing.budget) existing.budget = {};
          existing.budget[metric] = value;
        }
      }
      
      // Merge source_locations
      for (const [metric, source] of Object.entries(addPeriod.source_locations || {})) {
        if (!existing.source_locations?.[metric]) {
          if (!existing.source_locations) existing.source_locations = {};
          existing.source_locations[metric] = source;
        }
      }
    } else {
      // New period - add it
      periodMap.set(addPeriod.period, { ...addPeriod });
    }
  }
  
  // Convert back to array and sort
  const mergedPeriods = Array.from(periodMap.values()).sort(
    (a, b) => a.period.localeCompare(b.period)
  );
  
  const newActualCount = mergedPeriods.reduce((sum, p) => sum + Object.keys(p.actuals || {}).length, 0);
  const newBudgetCount = mergedPeriods.reduce((sum, p) => sum + Object.keys(p.budget || {}).length, 0);
  
  console.log(`[Merge] Combined result: ${mergedPeriods.length} periods, ${newActualCount} actuals, ${newBudgetCount} budget`);
  
  return {
    ...base,
    multi_periods: mergedPeriods
  };
}

/**
 * Serverless-compatible extraction (no Assistants API)
 * Single-pass Chat API extraction for Vercel deployment
 */
async function extractExcelWithVisionGuidedChat(
  openai: OpenAI,
  excelData: DeterministicExcelResult,
  filename: string,
  guide?: PortcoGuide
): Promise<Partial<UnifiedExtractionResult>> {
  console.log(`[Serverless Excel] Processing ${excelData.sheets.length} sheets...`);
  
  // Categorize sheets
  const sheetCategories = categorizeSheets(excelData.sheets.map(s => s.sheetName));
  
  // Extract cover context
  const coverContext = extractCoverSheetContext(excelData.sheets);
  
  // Build comprehensive data view
  let excelContent = `EXCEL FILE: ${filename}\n`;
  excelContent += `OUTPUT TABS: ${sheetCategories.output.join(', ')}\n`;
  excelContent += `INPUT TABS: ${sheetCategories.input.join(', ')}\n`;
  excelContent += coverContext;
  excelContent += '\n\n';
  
  // Process output sheets first
  const orderedSheets = [
    ...excelData.sheets.filter(s => sheetCategories.output.includes(s.sheetName)),
    ...excelData.sheets.filter(s => !sheetCategories.output.includes(s.sheetName)).slice(0, 2)
  ];
  
  for (const sheet of orderedSheets) {
    excelContent += `=== ${sheet.sheetName} (${sheet.range}) ===\n`;
    
    const totalRows = sheet.data.length;
    
    // First 80 rows
    const headRows = sheet.data.slice(0, 80);
    for (let i = 0; i < headRows.length; i++) {
      const row = headRows[i];
      if (row && row.some((c: any) => c !== null && c !== undefined && c !== '')) {
        const cells = row.map((cell: any, j: number) => {
          if (cell === null || cell === undefined || cell === '') return '';
          const colRef = columnIndexToLetter(j);
          return `${colRef}${i + 1}:${String(cell).slice(0, 15).trim()}`;
        }).join(' | ');
        excelContent += `${cells}\n`;
      }
    }
    
    // Last 50 rows (summaries)
    if (totalRows > 130) {
      excelContent += `\n... (rows 81 to ${totalRows - 50} omitted) ...\n`;
      excelContent += `\n=== TAIL (Summary rows) ===\n`;
      const tailRows = sheet.data.slice(-50);
      const tailStart = totalRows - 50;
      for (let i = 0; i < tailRows.length; i++) {
        const row = tailRows[i];
        if (row && row.some((c: any) => c !== null && c !== undefined && c !== '')) {
          const cells = row.map((cell: any, j: number) => {
            if (cell === null || cell === undefined || cell === '') return '';
            const colRef = columnIndexToLetter(j);
            return `${colRef}${tailStart + i + 1}:${String(cell).slice(0, 15).trim()}`;
          }).join(' | ');
          excelContent += `${cells}\n`;
        }
      }
    }
    excelContent += '\n';
  }
  
  let guideContext = '';
  if (guide) {
    guideContext = `\nCompany: ${guide.company_metadata?.name || 'Unknown'}
Currency: ${guide.company_metadata?.currency || 'EUR'}
Business: ${(guide.company_metadata?.business_models || []).join(', ')}`;
    
    // Add metrics to look for
    const metricsMapping = (guide as any).metrics_mapping;
    if (metricsMapping) {
      guideContext += '\n\nMetrics to extract:';
      for (const [id, cfg] of Object.entries(metricsMapping).slice(0, 15)) {
        guideContext += `\n- ${id}: ${(cfg as any).labels?.[0] || id}`;
      }
    }
  }
  
  const systemPrompt = `You are a financial analyst extracting budget and actual data from an Excel file.

TASK: Extract ALL financial metrics from ALL relevant sheets, clearly separating ACTUALS from BUDGET/FORECAST.

**MULTI-SHEET EXTRACTION:**
- From REVENUE sheet: Extract MRR, ARR, customer counts for EVERY monthly column
- From P&L sheet: Extract revenue, gross_margin, cogs, net_income, opex, ebitda for EVERY monthly column
- COMBINE metrics from both sheets into the SAME period entry in multi_periods

ACTUAL vs FORECAST DETECTION (Dynamic):
- Scan rows 1-5 for scenario labels: "Actual", "Act", "Forecast", "Budget", "Plan"
- Identify the transition column where data switches from Historical (Actuals) to Future (Budget/Forecast)
- All columns BEFORE this transition are "actual". All columns AFTER (and including) the transition are "budget"
- **Do NOT assume** the transition date. Derive it strictly from the file headers.
${guideContext}

Return ONLY valid JSON:
{
  "pageCount": 1,
  "pages": [{ "pageNumber": 1, "text": "Excel extraction", "tables": [] }],
  "financial_summary": {
    "actuals": {},
    "budget": {},
    "period": "2025",
    "currency": "EUR",
    "source_locations": {},
    "multi_periods": [
      { 
        "period": "2024-09-01", 
        "actuals": { "mrr": 150000, "arr": 1800000, "revenue": 500000 }, 
        "budget": {},
        "source_locations": {
          "mrr": { "sheet": "Revenue", "cell": "J29" },
          "revenue": { "sheet": "P&L_consolidated", "cell": "W16" }
        }
      },
      { 
        "period": "2025-03-01", 
        "actuals": {}, 
        "budget": { "mrr": 180000, "arr": 2160000, "revenue": 600000 },
        "source_locations": {
          "mrr": { "sheet": "Revenue", "cell": "P29" },
          "revenue": { "sheet": "P&L_consolidated", "cell": "AC16" }
        }
      }
    ]
  }
}

CRITICAL RULES:
- ONLY include values that exist in the spreadsheet - DO NOT hallucinate
- Extract for EVERY monthly column (typically 12-36 months)
- Use column labels to determine actual vs budget for EACH period
- Include source_locations with sheet and cell for EVERY metric
- Look for MRR/ARR totals in summary rows (often rows 29, 42, or labeled "Total")`;

  try {
    // Phase 1: Coordinate Map (Parallel)
    // Run concurrently with main extraction to save time
    const coordinatesPromise = extractExcelCoordinates(openai, excelContent, guideContext);

    // Phase 2: Standard Extraction
    const extractionPromise = openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract financial data from this Excel:\n\n${excelContent.slice(0, 100000)}` }
      ],
      max_completion_tokens: 16000
    });

    const [coords, response] = await Promise.all([coordinatesPromise, extractionPromise]);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createEmptyResult(filename, 'serverless_excel_no_response');
    }

    console.log(`[Serverless Excel] Response received, length: ${content.length}`);
    const result = parseJsonResponse(content, filename, 'excel-serverless-chat');

    // Phase 3: Deterministic Patch (The "Miner")
    // Use EXPLICIT actualColumns and budgetColumns lists - no guessing!
    if (coords?.sheets?.length > 0 && result.financial_summary?.multi_periods) {
      console.log(`[Coordinates] Patching values using explicit actual/budget column lists...`);
      
      for (const sheetMap of coords.sheets) {
        const sheet = excelData.sheets.find(s => s.sheetName === sheetMap.sheetName);
        if (!sheet) continue;

        // Get explicit column lists
        const actualColumns = new Set(sheetMap.actualColumns || []);
        const budgetColumns = new Set(sheetMap.budgetColumns || []);
        const columnDates = sheetMap.columnDates || sheetMap.dateColumns || {};

        // Iterate through extracted periods
        const periods: any[] = result.financial_summary.multi_periods;
        for (const period of periods) {
          const date = period.period;
          
          // Find column for this date (reverse lookup)
          let colLetter: string | undefined;
          for (const [col, colDate] of Object.entries(columnDates)) {
            if (colDate === date) {
              colLetter = col;
              break;
            }
          }
          
          if (!colLetter) continue;
          
          const colIdx = letterToColumnIndex(colLetter);
          const isActualColumn = actualColumns.has(colLetter);
          const isBudgetColumn = budgetColumns.has(colLetter);
          
          if (!isActualColumn && !isBudgetColumn) continue;
          
          // Get all metrics to patch
          const allMetrics = new Set([
            ...Object.keys(period.actuals || {}),
            ...Object.keys(period.budget || {}),
            ...Object.keys(sheetMap.metricRows || {})
          ]);
          
          for (const metric of allMetrics) {
            const rowIdx = sheetMap.metricRows?.[metric];
            if (!rowIdx) continue;
            
            const cellValue = sheet.data[rowIdx - 1]?.[colIdx];
            if (cellValue === undefined || typeof cellValue !== 'number') continue;
            
            // CLEAN classification
            if (isActualColumn) {
              if (!period.actuals) period.actuals = {};
              period.actuals[metric] = cellValue;
              if (period.budget?.[metric] !== undefined) delete period.budget[metric];
            } else if (isBudgetColumn) {
              if (!period.budget) period.budget = {};
              period.budget[metric] = cellValue;
              if (period.actuals?.[metric] !== undefined) delete period.actuals[metric];
            }
            
            if (!period.source_locations) period.source_locations = {};
            period.source_locations[metric] = {
              sheet: sheetMap.sheetName,
              cell: `${colLetter}${rowIdx}`
            };
          }
        }
      }
    }

    return result;
    
  } catch (error: any) {
    console.error('[Serverless Excel] Failed:', error?.message);
    throw error;
  }
}

// ============================================================================
// Excel Extraction via Assistants API (Code Interpreter) - Local Only
// ============================================================================

/**
 * Extract financial data from Excel using Assistants API with Code Interpreter
 * NOTE: Not Vercel-compatible due to polling timeouts. Use for local dev only.
 */
async function extractExcelWithAssistant(
  openai: OpenAI,
  file: FileMetadata,
  guide?: PortcoGuide
): Promise<Partial<UnifiedExtractionResult>> {
  console.log(`[Assistants API] Processing Excel: ${file.filename}...`);
  
  try {
    // Step 1: Upload file for Code Interpreter
    const uploadedFile = await openai.files.create({
      file: new File([file.buffer as any], file.filename, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      }),
      purpose: 'assistants'
    });
    console.log(`[Assistants API] File uploaded: ${uploadedFile.id}`);
    
    // Build guide context
    let guideContext = '';
    if (guide) {
      guideContext = `\nCompany: ${guide.company_metadata?.name || 'Unknown'}
Business Model: ${(guide.company_metadata?.business_models || []).join(', ')}
Currency: ${guide.company_metadata?.currency || 'EUR'}`;
    }
    
    // Step 2: Create an Assistant with Code Interpreter
    const assistant = await openai.beta.assistants.create({
      name: 'Financial Data Extractor',
      instructions: `You are a senior financial analyst. Extract ALL financial metrics from Excel files.
Return a JSON object with this structure:
{
  "financial_summary": {
    "actuals": { "<metric_id>": <value> },
    "budget": { "<metric_id>": <value> },
    "period": "<period>",
    "currency": "EUR",
    "multi_periods": [{ "period": "YYYY-MM-DD", "actuals": {}, "budget": {} }]
  }
}
Standard metric IDs: mrr, arr, revenue, gross_margin, customers, monthly_burn, cash_balance, runway_months, headcount
ONLY extract values that exist. DO NOT hallucinate.${guideContext}`,
      tools: [{ type: 'code_interpreter' }],
      model: 'gpt-4o' // Code Interpreter works best with gpt-4o
    });
    
    // Step 3: Create a Thread with the file
    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: `Analyze this Excel file and extract all financial metrics. 
Look for:
- Actuals vs Budget/Plan columns
- Monthly time series data
- Key metrics: MRR, ARR, Revenue, Customers, Burn, Cash Balance

Return ONLY valid JSON with the financial_summary structure.`,
          attachments: [
            { file_id: uploadedFile.id, tools: [{ type: 'code_interpreter' }] }
          ]
        }
      ]
    });
    
    // Step 4: Run the Assistant
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id
    });
    
    if (run.status !== 'completed') {
      throw new Error(`Assistant run failed with status: ${run.status}`);
    }
    
    // Step 5: Get the response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(m => m.role === 'assistant');
    
    let content = '';
    if (assistantMessage?.content) {
      for (const block of assistantMessage.content) {
        if (block.type === 'text') {
          content += block.text.value;
        }
      }
    }
    
    // Step 6: Cleanup
    try {
      await (openai.beta.assistants as any).del(assistant.id);
      await (openai.files as any).del(uploadedFile.id);
    } catch (cleanupErr) {
      console.warn(`[Assistants API] Cleanup warning: ${cleanupErr}`);
    }
    
    if (!content) {
      console.warn('[Assistants API] No content returned');
      return createEmptyResult(file.filename, 'assistant_no_response');
    }
    
    console.log(`[Assistants API] Response received, length: ${content.length}`);
    return parseJsonResponse(content, file.filename, 'excel-assistants-api');
    
  } catch (error: any) {
    console.error('[Assistants API] Extraction failed:', error?.message || error);
    throw error;
  }
}

// ============================================================================
// Excel Extraction via PDF Vision (for charts and visual elements)
// ============================================================================

/**
 * Convert Excel to PDF and extract via Vision API
 * This captures charts, formatting, and visual elements that Code Interpreter might miss
 */
async function extractExcelAsPDFVision(
  openai: OpenAI,
  file: FileMetadata,
  guide?: PortcoGuide
): Promise<Partial<UnifiedExtractionResult>> {
  console.log(`[PDF Vision] Converting Excel to PDF for visual extraction: ${file.filename}...`);
  
  try {
    // Convert Excel to PDF using a simple approach:
    // We'll create a text-based representation and send it as if it were extracted from PDF
    // For true PDF conversion, we'd need a library like libreoffice or a cloud service
    
    // For now, use the Chat API with a vision-focused prompt
    // TODO: Implement actual XLSX → PDF conversion for chart extraction
    
    const excelData = parseExcelDeterministic(file.buffer);
    
    // Build a visual-focused representation
    let visualContent = `EXCEL FILE: ${file.filename}\n\n`;
    
    for (const sheet of excelData.sheets) {
      visualContent += `\n=== SHEET: ${sheet.sheetName} ===\n`;
      visualContent += `Range: ${sheet.range}\n\n`;
      
      // Format as a table for visual parsing
      const rows = sheet.data.slice(0, 50);
      for (const row of rows) {
        if (row && row.length > 0) {
          visualContent += row.map((cell: any) => 
            cell !== null && cell !== undefined ? String(cell).padEnd(15) : ''.padEnd(15)
          ).join(' | ') + '\n';
        }
      }
    }
    
    // Build guide context
    let guideContext = '';
    if (guide) {
      guideContext = `\nCompany: ${guide.company_metadata?.name || 'Unknown'}
Currency: ${guide.company_metadata?.currency || 'EUR'}`;
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: `You are analyzing a spreadsheet for visual patterns, charts descriptions, and formatted tables.
Focus on:
- Table structures and headers
- Any chart descriptions or visual summaries
- Formatted sections (bold headers, colored cells mentioned)
- Time series patterns (monthly/quarterly columns)

Return JSON with financial_summary including actuals, budget, and multi_periods.${guideContext}`
        },
        {
          role: 'user',
          content: `Extract financial data focusing on visual structure:\n\n${visualContent.slice(0, 80000)}`
        }
      ],
      max_completion_tokens: 16000
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createEmptyResult(file.filename, 'pdf_vision_no_response');
    }
    
    console.log(`[PDF Vision] Response received, length: ${content.length}`);
    return parseJsonResponse(content, file.filename, 'excel-pdf-vision');
    
  } catch (error: any) {
    console.error('[PDF Vision] Extraction failed:', error?.message || error);
    throw error;
  }
}

// ============================================================================
// Reconcile Excel Extraction Results
// ============================================================================

/**
 * Reconcile results from multiple extraction methods
 * Priority: Assistants API (numbers) > PDF Vision (visual context) > Deterministic (fallback)
 */
function reconcileExcelResults(
  assistantData: Partial<UnifiedExtractionResult> | null,
  pdfVisionData: Partial<UnifiedExtractionResult> | null,
  deterministicData: DeterministicExcelResult,
  filename: string
): Partial<UnifiedExtractionResult> {
  console.log(`[Reconcile] Merging Excel extraction results...`);
  
  // Start with empty result
  const result: Partial<UnifiedExtractionResult> = {
    pageCount: 1,
    pages: [],
    fullText: '',
    financial_summary: {
      actuals: {},
      budget: {},
      multi_periods: []
    },
    info: {
      filename,
      extractionMethod: 'excel-dual-extraction',
      reconciliation_notes: ''
    }
  };
  
  const notes: string[] = [];
  
  // Merge Assistants API results (highest priority for numbers)
  if (assistantData?.financial_summary) {
    const summary = assistantData.financial_summary;
    notes.push(`Assistants API: ${Object.keys(summary.actuals || {}).length} actuals, ${Object.keys(summary.budget || {}).length} budget`);
    
    // Copy actuals
    if (summary.actuals) {
      result.financial_summary!.actuals = { ...summary.actuals };
    }
    // Copy budget
    if (summary.budget) {
      result.financial_summary!.budget = { ...summary.budget };
    }
    // Copy multi_periods
    if (summary.multi_periods && summary.multi_periods.length > 0) {
      result.financial_summary!.multi_periods = [...summary.multi_periods];
    }
    // Copy period info
    if (summary.period) result.financial_summary!.period = summary.period;
    if (summary.currency) result.financial_summary!.currency = summary.currency;
  }
  
  // Merge PDF Vision results (fills gaps, adds visual context)
  if (pdfVisionData?.financial_summary) {
    const summary = pdfVisionData.financial_summary;
    notes.push(`PDF Vision: ${Object.keys(summary.actuals || {}).length} actuals, ${Object.keys(summary.budget || {}).length} budget`);
    
    // Only add metrics not already present (don't override Assistants data)
    if (summary.actuals) {
      for (const [key, value] of Object.entries(summary.actuals)) {
        if (!result.financial_summary!.actuals![key]) {
          result.financial_summary!.actuals![key] = value;
        }
      }
    }
    if (summary.budget) {
      for (const [key, value] of Object.entries(summary.budget)) {
        if (!result.financial_summary!.budget![key]) {
          result.financial_summary!.budget![key] = value;
        }
      }
    }
    // Merge multi_periods (add periods not already present)
    if (summary.multi_periods) {
      const existingPeriods = new Set(
        (result.financial_summary!.multi_periods || []).map(p => p.period)
      );
      for (const period of summary.multi_periods) {
        if (!existingPeriods.has(period.period)) {
          result.financial_summary!.multi_periods!.push(period);
        }
      }
    }
  }
  
  // If both failed, fall back to deterministic parsing summary
  if (!assistantData?.financial_summary && !pdfVisionData?.financial_summary) {
    notes.push('Both extractions failed, using deterministic data only');
    // Create basic summary from deterministic data
    result.financial_summary!.period = 'Unknown';
    result.financial_summary!.currency = 'EUR';
  }
  
  // Sort multi_periods by date
  if (result.financial_summary!.multi_periods) {
    result.financial_summary!.multi_periods.sort((a, b) => 
      a.period.localeCompare(b.period)
    );
  }
  
  result.info!.reconciliation_notes = notes.join('; ');
  console.log(`[Reconcile] ${result.info!.reconciliation_notes}`);
  
  return result;
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
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract financial data from this spreadsheet: "${filename}"\n\nContent:\n${textContent.fullText.slice(0, 50000)}`
        }
      ],
      max_completion_tokens: 16000
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
    
    // Aggressively find JSON object pattern
    // 1. Try standard markdown code blocks
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    } 
    
    // 2. If no code blocks or parsing failed, look for outer braces
    if (!jsonStr.startsWith('{')) {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        jsonStr = jsonStr.substring(start, end + 1);
      }
    }
    
    // 3. Cleanup common issues
    jsonStr = jsonStr.replace(/\/\/.*$/gm, ''); // Remove single line comments
    
    // 4. Fix trailing commas before closing brackets
    jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
    
    // 5. Fix incomplete arrays - close unclosed brackets
    let openBrackets = 0;
    let openBraces = 0;
    for (const char of jsonStr) {
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
    }
    // Add missing closing brackets
    while (openBrackets > 0) {
      jsonStr += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      jsonStr += '}';
      openBraces--;
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
    
  } catch (parseErr: any) {
    console.warn(`[${method}] JSON parse failed: ${parseErr.message}`);
    // Return raw text result so we at least have the content
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

