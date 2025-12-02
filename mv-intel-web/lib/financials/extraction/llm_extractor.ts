/**
 * LLM-based Document Extraction Service
 * 
 * Uses OpenAI GPT-4 (or GPT-4 Vision for images) to extract:
 * - Financial data from tables
 * - Period/date information from filenames and content
 * - Qualitative insights from narrative text
 * 
 * Why OpenAI over Google Vision?
 * - Consistent with existing platform LLM usage (GPT-5.1 for chat, taxonomy)
 * - Single API/billing relationship
 * - GPT-4V can do OCR + semantic understanding in one call
 * - Better at financial domain understanding
 */

import OpenAI from 'openai';
import { CompanyInsight, InsightCategory, INSIGHT_EXTRACTION_PROMPT, PERIOD_EXTRACTION_PROMPT } from '../qualitative/insights_schema';
import { PDFContent } from '../ingestion/parse_pdf';

// Lazy initialization to avoid build-time env var issues
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }
  return openaiClient;
}

interface PeriodExtractionResult {
  period_type: 'month' | 'quarter' | 'year' | 'unknown';
  period_date: string | null;  // YYYY-MM-DD format
}

interface TableExtractionResult {
  tables: ExtractedTable[];
  raw_text?: string;
}

interface ExtractedTable {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  page?: number;
  confidence: number;
}

/**
 * Extract period date from filename and/or document content
 */
export async function extractPeriodFromDocument(
  filename: string,
  contentPreview: string
): Promise<PeriodExtractionResult> {
  const openai = getOpenAI();
  
  const prompt = PERIOD_EXTRACTION_PROMPT
    .replace('{filename}', filename)
    .replace('{content_preview}', contentPreview.slice(0, 500));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // Current stable model with best performance
      messages: [
        { role: 'system', content: 'You are a financial document analyst. Extract dates accurately.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,  // Low temperature for factual extraction
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { period_type: 'unknown', period_date: null };
    }

    const result = JSON.parse(content) as PeriodExtractionResult;
    
    // Validate the date format
    if (result.period_date && !/^\d{4}-\d{2}-\d{2}$/.test(result.period_date)) {
      console.warn(`[LLM Extractor] Invalid date format: ${result.period_date}`);
      return { period_type: 'unknown', period_date: null };
    }

    return result;
  } catch (error) {
    console.error('[LLM Extractor] Period extraction failed:', error);
    return { period_type: 'unknown', period_date: null };
  }
}

/**
 * Extract qualitative insights from document text
 */
export async function extractInsightsFromText(
  documentText: string,
  companyId: string,
  period: string,
  sourceFileId?: string
): Promise<CompanyInsight[]> {
  const openai = getOpenAI();
  
  // Truncate if too long (GPT-4 context limit considerations)
  const truncatedText = documentText.slice(0, 15000);
  
  const prompt = INSIGHT_EXTRACTION_PROMPT.replace('{document_text}', truncatedText);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: 'You are a venture capital analyst extracting key insights from portfolio company documents. Focus on investment-relevant information.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1] : content;
    }

    const rawInsights = JSON.parse(jsonStr) as Array<{
      category: InsightCategory;
      title: string;
      content: string;
      sentiment?: string;
      confidence?: number;
    }>;

    // Transform to full CompanyInsight objects
    return rawInsights.map((raw, index) => ({
      id: `${companyId}_${period}_${index}`,
      company_id: companyId,
      period,
      category: raw.category,
      title: raw.title,
      content: raw.content,
      sentiment: raw.sentiment as any || 'neutral',
      confidence: raw.confidence || 0.8,
      source_file_id: sourceFileId,
      extracted_at: new Date().toISOString(),
      extracted_by: 'llm' as const,
      llm_model: 'gpt-4o'
    }));

  } catch (error) {
    console.error('[LLM Extractor] Insight extraction failed:', error);
    return [];
  }
}

/**
 * Extract tables from PDF page image using GPT-4 Vision
 * 
 * This is the recommended approach for scanned PDFs or complex layouts
 * where text extraction alone doesn't preserve table structure.
 */
export async function extractTablesFromImage(
  imageBuffer: Buffer,
  pageNumber: number,
  context?: string  // Optional context about what to look for
): Promise<TableExtractionResult> {
  const openai = getOpenAI();
  
  // Convert buffer to base64
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';  // Assume PNG for now

  const systemPrompt = `You are a financial data extraction specialist. 
Extract all tables from this document image and return them as structured JSON.

For each table, provide:
- title: The table title if visible
- headers: Array of column headers
- rows: 2D array of cell values (convert numbers, keep units separate)
- confidence: Your confidence in the extraction (0-1)

Return format: { "tables": [...], "raw_text": "any other relevant text" }`;

  const userPrompt = context 
    ? `Extract financial tables from this page. Context: ${context}`
    : 'Extract all financial tables from this document page.';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // gpt-4o has vision capability built-in
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { tables: [] };
    }

    // Parse JSON response
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1] : content;
    }

    const result = JSON.parse(jsonStr) as TableExtractionResult;
    
    // Add page number to each table
    result.tables = result.tables.map(t => ({ ...t, page: pageNumber }));
    
    return result;

  } catch (error) {
    console.error('[LLM Extractor] Vision table extraction failed:', error);
    return { tables: [] };
  }
}

/**
 * Extract structured financial data from text using LLM
 * 
 * Use this when you have text from a digital PDF but need to
 * identify and structure the financial values.
 */
export async function extractFinancialDataFromText(
  text: string,
  metricsToFind: string[],  // e.g., ['ARR', 'MRR', 'Gross Margin']
  pageNumber?: number
): Promise<Record<string, { value: number; unit: string; confidence: number }>> {
  const openai = getOpenAI();
  
  const prompt = `Extract the following financial metrics from this text:
${metricsToFind.map(m => `- ${m}`).join('\n')}

Text:
${text.slice(0, 5000)}

For each metric found, return:
- value: The numeric value (no commas, convert percentages to decimals like 0.25 for 25%)
- unit: The unit (USD, EUR, %, months, etc.)
- confidence: Your confidence this is the correct value (0-1)

Return JSON object with metric names as keys. If a metric is not found, omit it.
Example: { "ARR": { "value": 5000000, "unit": "USD", "confidence": 0.95 } }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a financial data extraction specialist. Extract values accurately.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {};
    }

    return JSON.parse(content);

  } catch (error) {
    console.error('[LLM Extractor] Financial data extraction failed:', error);
    return {};
  }
}

/**
 * Validate extracted financial values using LLM
 * 
 * Cross-checks extracted values for consistency and reasonableness
 */
export async function validateExtractedData(
  extractedData: Record<string, number>,
  companyContext: string  // e.g., "SaaS company, Series A, ~$5M ARR"
): Promise<{ valid: boolean; issues: string[] }> {
  const openai = getOpenAI();
  
  const prompt = `Validate these extracted financial metrics for reasonableness:

Company context: ${companyContext}

Extracted values:
${Object.entries(extractedData).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Check for:
1. Obvious errors (e.g., negative ARR, >100% margins)
2. Inconsistencies (e.g., Gross Margin > 100%)
3. Implausible values given the company context

Return JSON: { "valid": true/false, "issues": ["issue1", "issue2"] }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a financial data quality checker.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { valid: true, issues: [] };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('[LLM Extractor] Validation failed:', error);
    return { valid: true, issues: [] };  // Fail open
  }
}

/**
 * Extract financial data from Excel/JSON content using LLM (Fallback)
 * 
 * Used when deterministic mapping (cell B5) fails.
 * We pass a simplified representation of the spreadsheet and the mapping goals.
 */
export async function extractFinancialsFromExcelLLM(
  sheetData: any[][],
  mappingGoals: Record<string, string>, // { "revenue": "Find 'Subscription Revenue' or similar" }
  sheetName: string
): Promise<Record<string, { value: number; cell: string; confidence: number }>> {
  const openai = getOpenAI();

  // Convert sheet data to a dense string representation (ignoring empty cells to save tokens)
  // Format: "Row 1: [A1: Value, B1: Value...]"
  let sheetContext = `Sheet: ${sheetName}\n`;
  sheetData.slice(0, 50).forEach((row, rowIndex) => { // Limit to first 50 rows
    const rowStr = row
      .map((val, colIndex) => val ? `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}:${val}` : '')
      .filter(s => s)
      .join(', ');
    if (rowStr) sheetContext += `Row ${rowIndex + 1}: ${rowStr}\n`;
  });

  const prompt = `Extract the following financial metrics from this spreadsheet data:
${Object.entries(mappingGoals).map(([key, desc]) => `- ${key}: ${desc}`).join('\n')}

Spreadsheet Data:
${sheetContext.slice(0, 10000)}

For each metric, identify the most likely cell and value.
Return JSON: { "metric_id": { "value": number, "cell": "B5", "confidence": 0-1 } }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert financial analyst reading a spreadsheet.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};
    return JSON.parse(content);
  } catch (error) {
    console.error('[LLM Extractor] Excel extraction failed:', error);
    return {};
  }
}

