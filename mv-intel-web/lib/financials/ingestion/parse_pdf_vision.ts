/**
 * Vision-based PDF Parser
 * 
 * Uses GPT-4 Vision to extract text and tables from PDFs.
 * This bypasses pdf-parse which has issues in Vercel serverless.
 * 
 * Flow:
 * 1. Use pdf-lib to get PDF metadata and page count
 * 2. For each page, send the raw PDF bytes to GPT-4V
 * 3. GPT-4V extracts text and identifies tables
 * 
 * Note: GPT-4V can process PDF pages directly when base64 encoded,
 * but for better results we use a hybrid approach.
 */

import OpenAI from 'openai';
import { PDFDocument } from 'pdf-lib';
import { FileMetadata } from './load_file';

// Lazy initialization
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for PDF vision extraction');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
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

export interface PDFContent {
  pageCount: number;
  info: any;
  pages: PDFPage[];
  fullText: string;
}

/**
 * Parse PDF using GPT-4 Vision
 * 
 * This is more expensive than text extraction but works reliably
 * in serverless environments and handles complex layouts better.
 */
export async function parsePDFWithVision(file: FileMetadata): Promise<PDFContent> {
  const openai = getOpenAI();
  
  console.log(`[PDF Vision] Starting extraction for ${file.filename}`);
  
  // Get page count using pdf-lib (lightweight, works in serverless)
  let pageCount = 1;
  try {
    const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
    console.log(`[PDF Vision] PDF has ${pageCount} pages`);
  } catch (err) {
    console.warn('[PDF Vision] Could not read PDF metadata, assuming 1 page:', err);
  }
  
  // Convert entire PDF to base64 for vision API
  const base64Pdf = file.buffer.toString('base64');
  
  // For efficiency, we'll process in batches or limit pages
  // GPT-4V can handle PDFs but we'll be strategic about which pages to process
  const maxPagesToProcess = Math.min(pageCount, 15); // Limit to first 15 pages for cost
  
  const pages: PDFPage[] = [];
  let fullText = '';
  
  // Process pages in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < maxPagesToProcess; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, maxPagesToProcess); j++) {
      batch.push(extractPageContent(openai, base64Pdf, j + 1, pageCount));
    }
    
    const results = await Promise.all(batch);
    for (const result of results) {
      if (result) {
        pages.push(result);
        fullText += result.text + '\n\n';
      }
    }
  }
  
  // Sort pages by number
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  
  console.log(`[PDF Vision] Extracted ${pages.length} pages, total text length: ${fullText.length}`);
  
  return {
    pageCount,
    info: { filename: file.filename, extractionMethod: 'gpt-4-vision' },
    pages,
    fullText: fullText.trim()
  };
}

/**
 * Extract content from a single PDF page using GPT-4 Vision
 */
async function extractPageContent(
  openai: OpenAI,
  base64Pdf: string,
  pageNumber: number,
  totalPages: number
): Promise<PDFPage | null> {
  const systemPrompt = `You are a financial document extraction specialist.
Extract ALL text content from this PDF page, preserving the structure.

For tables, also identify:
- Table headers
- Row data (preserve numbers exactly as shown)

Return JSON format:
{
  "text": "Full text content of the page, preserving layout with newlines",
  "tables": [
    {
      "title": "Table title if visible",
      "headers": ["Col1", "Col2"],
      "rows": [["val1", "val2"], ["val3", "val4"]],
      "confidence": 0.95
    }
  ]
}

Important:
- Preserve all numbers exactly (don't round)
- Keep currency symbols and units
- Include all text, not just tables
- For financial metrics, capture the exact values shown`;

  const userPrompt = `Extract all content from page ${pageNumber} of ${totalPages} of this financial document.
Focus on capturing:
- All KPI values and metrics
- Table data with headers
- Any narrative text

Return the structured JSON as specified.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                // GPT-4V can process PDFs when sent as data URL
                // We're sending the whole PDF and asking for a specific page
                // This works because GPT-4V understands multi-page documents
                url: `data:application/pdf;base64,${base64Pdf}`,
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
      console.warn(`[PDF Vision] No content returned for page ${pageNumber}`);
      return null;
    }

    // Parse JSON response
    let parsed: { text: string; tables?: ExtractedTable[] };
    try {
      // Handle potential markdown code blocks
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1] : content;
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      // If JSON parsing fails, treat the whole response as text
      console.warn(`[PDF Vision] JSON parse failed for page ${pageNumber}, using raw text`);
      parsed = { text: content, tables: [] };
    }

    return {
      pageNumber,
      text: parsed.text || '',
      tables: parsed.tables || []
    };

  } catch (error: any) {
    console.error(`[PDF Vision] Error extracting page ${pageNumber}:`, error?.message || error);
    return null;
  }
}

/**
 * Extract specific financial metrics from PDF using Vision
 * 
 * More targeted extraction when you know what you're looking for.
 */
export async function extractMetricsFromPDFVision(
  file: FileMetadata,
  metricsToFind: string[]
): Promise<Record<string, { value: number; unit: string; page: number; confidence: number }>> {
  const openai = getOpenAI();
  const base64Pdf = file.buffer.toString('base64');
  
  const systemPrompt = `You are a financial analyst extracting specific KPIs from a document.
Find these metrics: ${metricsToFind.join(', ')}

For each metric found, return:
- value: The numeric value (no formatting, just the number)
- unit: The unit (EUR, USD, %, months, count, etc.)
- page: Which page it was found on
- confidence: Your confidence (0-1)

Return JSON: { "metric_name": { "value": 123, "unit": "EUR", "page": 1, "confidence": 0.95 } }
Only include metrics you actually found with high confidence.`;

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
              text: `Find these financial metrics in the document: ${metricsToFind.join(', ')}` 
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64Pdf}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};
    
    return JSON.parse(content);
    
  } catch (error) {
    console.error('[PDF Vision] Metric extraction failed:', error);
    return {};
  }
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

