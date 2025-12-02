/**
 * Vision-based PDF Parser using OpenAI GPT-4o + GPT-5.1 + Perplexity
 * 
 * Architecture:
 * 1. GPT-4o Vision: Extract visual content (charts, tables, layouts)
 * 2. GPT-5.1 Structured: Deep financial analysis and validation
 * 3. Reconciliation: Merge results with confidence scoring
 * 4. Perplexity Sonar: Industry benchmark validation (optional)
 * 
 * This parallel approach provides:
 * - Best visual extraction (GPT-4o optimized for vision)
 * - Best reasoning (GPT-5.1 adaptive reasoning)
 * - Cross-validation between models
 * - Real-time industry context (Perplexity)
 */

import OpenAI from 'openai';
import { FileMetadata } from './load_file';

// Lazy initialization
let openaiClient: OpenAI | null = null;
let perplexityClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for PDF extraction');
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

export interface PDFPage {
  pageNumber: number;
  text: string;
  tables?: ExtractedTable[];
}

export interface ExtractedTable {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  confidence: number;
}

export interface BenchmarkContext {
  industry_benchmarks?: Record<string, { typical_range: string; assessment: string }>;
  market_context?: string;
  flags?: string[];
}

export interface PDFContent {
  pageCount: number;
  info: any;
  pages: PDFPage[];
  fullText: string;
  benchmarks?: BenchmarkContext;
}

/**
 * Parse PDF using parallel GPT-4o Vision + GPT-5.1 Analysis + Perplexity Benchmarks
 */
export async function parsePDFWithVision(file: FileMetadata): Promise<PDFContent> {
  const openai = getOpenAI();
  
  console.log(`[PDF Vision] Starting parallel extraction for ${file.filename}`);
  
  // Convert PDF to base64
  const pdfBase64 = file.buffer.toString('base64');
  console.log(`[PDF Vision] PDF size: ${Math.round(pdfBase64.length / 1024)}KB base64`);
  
  // Run parallel extraction: GPT-4o Vision + GPT-5.1 Structured
  const [visionResult, structuredResult] = await Promise.all([
    extractWithVision(openai, pdfBase64, file.filename),
    extractWithStructuredAnalysis(openai, pdfBase64, file.filename)
  ]);
  
  // Reconcile results using GPT-5.1
  const reconciledResult = await reconcileResults(openai, visionResult, structuredResult, file.filename);
  
  // Enrich with Perplexity benchmarks (optional, non-blocking)
  const finalResult = await enrichWithBenchmarks(reconciledResult);
  
  console.log(`[PDF Vision] Extraction complete: ${finalResult.pages.length} pages, ${finalResult.fullText.length} chars`);
  
  return finalResult;
}

/**
 * GPT-4o Vision Extraction
 * Optimized for visual content: charts, complex layouts, scanned docs
 */
async function extractWithVision(
  openai: OpenAI,
  pdfBase64: string,
  filename: string
): Promise<PDFContent> {
  console.log(`[GPT-4o Vision] Starting visual extraction...`);
  
  const systemPrompt = `You are a financial document extraction specialist analyzing a PDF document visually.

Extract ALL visible content, returning structured JSON:

{
  "pageCount": <estimated number of pages>,
  "pages": [
    {
      "pageNumber": 1,
      "text": "All text content from this page",
      "tables": [
        {
          "title": "Table title if visible",
          "headers": ["Col1", "Col2"],
          "rows": [["val1", 12345], ["val2", 67890]],
          "confidence": 0.95
        }
      ]
    }
  ]
}

CRITICAL:
- Extract ALL visible text and tables
- Preserve numbers EXACTLY (no rounding)
- Keep currency symbols (€, $) and units
- Include data from charts/graphs if visible
- European format (1.234,56) stays as-is`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Extract all financial data from this PDF: "${filename}". Focus on KPIs, revenue, customers, metrics.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('[GPT-4o Vision] No content returned');
      return createEmptyResult(1, filename, 'vision_no_response');
    }

    return parseJsonResponse(content, filename, 'gpt-4o-vision');
    
  } catch (error: any) {
    console.error('[GPT-4o Vision] Extraction failed:', error?.message || error);
    return createEmptyResult(1, filename, 'vision_error');
  }
}

/**
 * GPT-5.1 Structured Analysis
 * Optimized for deep reasoning, financial logic, and validation
 */
async function extractWithStructuredAnalysis(
  openai: OpenAI,
  pdfBase64: string,
  filename: string
): Promise<PDFContent> {
  console.log(`[GPT-5.1 Analysis] Starting structured extraction...`);
  
  const systemPrompt = `You are a senior financial analyst with expertise in SaaS metrics and portfolio company reporting.

Analyze this PDF document and extract structured financial data:

{
  "pageCount": <number>,
  "pages": [
    {
      "pageNumber": 1,
      "text": "Key content and narrative",
      "tables": [
        {
          "title": "Table name",
          "headers": ["Metric", "Value", "Period"],
          "rows": [["ARR", 5000000, "Q3 2025"]],
          "confidence": 0.95
        }
      ]
    }
  ],
  "financial_summary": {
    "key_metrics": {"arr": 5000000, "mrr": 416667, "gross_margin": 0.75},
    "period": "Q3 2025",
    "currency": "EUR",
    "business_model": "saas"
  }
}

Apply financial reasoning:
- Validate metric relationships (ARR = MRR * 12)
- Identify reporting period from context
- Flag any inconsistencies you notice
- Extract both explicit and derived metrics
- Identify the business model (SaaS, marketplace, fintech, etc.)`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Perform deep financial analysis of this PDF: "${filename}". 
              
Extract:
1. All KPIs and metrics with their values
2. Revenue breakdown (MRR, ARR, by segment)
3. Customer metrics (count, growth, churn)
4. Financial health indicators
5. Any narrative insights about performance
6. Business model type

Apply your financial expertise to validate the numbers make sense.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('[GPT-5.1 Analysis] No content returned');
      return createEmptyResult(1, filename, 'structured_no_response');
    }

    return parseJsonResponse(content, filename, 'gpt-5.1-structured');
    
  } catch (error: any) {
    console.error('[GPT-5.1 Analysis] Extraction failed:', error?.message || error);
    // Fallback: if GPT-5.1 fails, return empty (vision result will be used)
    return createEmptyResult(1, filename, 'structured_error');
  }
}

/**
 * Reconcile results from both models using GPT-5.1's reasoning
 */
async function reconcileResults(
  openai: OpenAI,
  visionResult: PDFContent,
  structuredResult: PDFContent,
  filename: string
): Promise<PDFContent> {
  console.log(`[Reconciliation] Merging vision and structured results...`);
  
  // If one failed, use the other
  const visionFailed = visionResult.info?.reason?.includes('error') || visionResult.fullText === '';
  const structuredFailed = structuredResult.info?.reason?.includes('error') || structuredResult.fullText === '';
  
  if (visionFailed && structuredFailed) {
    console.error('[Reconciliation] Both extractions failed');
    return createEmptyResult(1, filename, 'both_failed');
  }
  
  if (visionFailed) {
    console.log('[Reconciliation] Using structured result only (vision failed)');
    return structuredResult;
  }
  
  if (structuredFailed) {
    console.log('[Reconciliation] Using vision result only (structured failed)');
    return visionResult;
  }
  
  // Both succeeded - merge intelligently
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { 
          role: 'system', 
          content: `You are reconciling two extraction results from the same PDF document.

VISION EXTRACTION (GPT-4o - optimized for visual content):
${JSON.stringify(visionResult.pages.slice(0, 3), null, 2)}

STRUCTURED EXTRACTION (GPT-5.1 - optimized for financial analysis):
${JSON.stringify(structuredResult.pages.slice(0, 3), null, 2)}

Merge these results:
1. Prefer structured values for financial metrics (more validated)
2. Use vision values for visual content (charts, images)
3. Combine unique content from both
4. Flag any significant discrepancies (>5% difference)

Return merged JSON in the same format:
{
  "pageCount": <number>,
  "pages": [...],
  "financial_summary": {...},
  "reconciliation_notes": "any discrepancies found"
}`
        },
        {
          role: 'user',
          content: `Merge the extraction results for "${filename}". Prioritize accuracy and completeness.`
        }
      ],
      max_tokens: 8000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const merged = parseJsonResponse(content, filename, 'reconciled');
      if (merged.pages.length > 0) {
        // Preserve financial_summary from structured result if not in merged
        if (!merged.info.financial_summary && structuredResult.info?.financial_summary) {
          merged.info.financial_summary = structuredResult.info.financial_summary;
        }
        return merged;
      }
    }
  } catch (error) {
    console.warn('[Reconciliation] Merge failed, using structured result:', error);
  }
  
  // Fallback: prefer structured result
  return structuredResult;
}

/**
 * Enrich extracted data with Perplexity industry benchmarks
 * Uses real-time web search to validate metrics against industry standards
 */
async function enrichWithBenchmarks(result: PDFContent): Promise<PDFContent> {
  const perplexity = getPerplexity();
  if (!perplexity) {
    return result; // Skip if Perplexity not configured
  }
  
  // Extract key metrics from financial_summary
  const summary = result.info?.financial_summary;
  if (!summary?.key_metrics) {
    console.log('[Perplexity] No financial summary to benchmark');
    return result;
  }
  
  const metrics = summary.key_metrics;
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
${JSON.stringify(metrics, null, 2)}
Currency: ${currency}

Provide industry benchmark context as JSON:
{
  "industry_benchmarks": {
    "gross_margin": { "typical_range": "70-85%", "assessment": "healthy" },
    "arr_growth": { "typical_range": "30-50% YoY", "assessment": "above average" }
  },
  "market_context": "Brief market context for this type of company",
  "flags": ["any concerns or notable observations"]
}

Only include benchmarks for metrics that were provided. Be specific to ${businessModel} business models.`
        }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        // Parse JSON, handling potential markdown
        let jsonStr = content;
        if (content.includes('```')) {
          const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          jsonStr = match ? match[1].trim() : content;
        }
        
        const benchmarks = JSON.parse(jsonStr) as BenchmarkContext;
        result.benchmarks = benchmarks;
        result.info.enriched_with_perplexity = true;
        
        console.log(`[Perplexity] Added ${Object.keys(benchmarks.industry_benchmarks || {}).length} benchmark comparisons`);
      } catch (parseErr) {
        console.warn('[Perplexity] Failed to parse benchmark response');
      }
    }
  } catch (error: any) {
    console.warn('[Perplexity] Benchmark enrichment failed:', error?.message);
    // Non-blocking - continue without benchmarks
  }
  
  return result;
}

/**
 * Parse JSON response with error handling
 */
function parseJsonResponse(content: string, filename: string, method: string): PDFContent {
  try {
    // Handle markdown code blocks
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1].trim() : content;
    }
    
    const parsed = JSON.parse(jsonStr);
    
    const pages: PDFPage[] = (parsed.pages || []).map((p: any, idx: number) => ({
      pageNumber: p.pageNumber || idx + 1,
      text: p.text || '',
      tables: p.tables || []
    }));

    const fullText = pages.map(p => p.text).join('\n\n');
    const pageCount = parsed.pageCount || pages.length || 1;

    return {
      pageCount,
      info: { 
        filename, 
        extractionMethod: method,
        reconciliation_notes: parsed.reconciliation_notes,
        financial_summary: parsed.financial_summary
      },
      pages,
      fullText
    };
    
  } catch (parseErr) {
    console.warn(`[${method}] JSON parse failed, returning raw text`);
    return {
      pageCount: 1,
      info: { filename, extractionMethod: `${method}-raw` },
      pages: [{ pageNumber: 1, text: content, tables: [] }],
      fullText: content
    };
  }
}

/**
 * Create empty result structure
 */
function createEmptyResult(pageCount: number, filename: string, reason: string): PDFContent {
  return {
    pageCount,
    info: { filename, extractionMethod: 'failed', reason },
    pages: [{
      pageNumber: 1,
      text: '',
      tables: []
    }],
    fullText: ''
  };
}

/**
 * Helper to find pages containing specific keywords
 */
export function findPagesWithKeywords(pdfContent: PDFContent, keywords: string[]): number[] {
  const matchedPages: number[] = [];
  
  for (const page of pdfContent.pages) {
    const hasAll = keywords.every(kw => 
      page.text.toLowerCase().includes(kw.toLowerCase())
    );
    if (hasAll) {
      matchedPages.push(page.pageNumber);
    }
  }
  
  return matchedPages;
}
