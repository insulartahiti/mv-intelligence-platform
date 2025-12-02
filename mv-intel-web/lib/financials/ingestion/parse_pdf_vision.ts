/**
 * Vision-based PDF Parser using OpenAI's Native PDF Support
 * 
 * As of late 2024/2025, GPT-4o can process PDF files directly via:
 * 1. Base64-encoded PDF in the message content
 * 2. File upload to /v1/files endpoint
 * 
 * This approach:
 * - No image conversion needed
 * - Works in any serverless environment
 * - Handles complex layouts, tables, charts
 * - Most accurate extraction method
 */

import OpenAI from 'openai';
import { FileMetadata } from './load_file';

// Lazy initialization
let openaiClient: OpenAI | null = null;

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
 * Parse PDF using OpenAI's native PDF support
 * 
 * GPT-4o can process PDFs directly when sent as base64 with the correct MIME type.
 * This is the simplest and most reliable approach for serverless environments.
 */
export async function parsePDFWithVision(file: FileMetadata): Promise<PDFContent> {
  const openai = getOpenAI();
  
  console.log(`[PDF Vision] Starting native PDF extraction for ${file.filename}`);
  
  // Convert PDF to base64
  const pdfBase64 = file.buffer.toString('base64');
  console.log(`[PDF Vision] PDF size: ${Math.round(pdfBase64.length / 1024)}KB base64`);
  
  // Use GPT-4o with native PDF support
  const extractedContent = await extractPDFContent(openai, pdfBase64, file.filename);
  
  console.log(`[PDF Vision] Extraction complete: ${extractedContent.pages.length} pages, ${extractedContent.fullText.length} chars`);
  
  return extractedContent;
}

/**
 * Extract content from PDF using GPT-4o's native PDF understanding
 */
async function extractPDFContent(
  openai: OpenAI,
  pdfBase64: string,
  filename: string
): Promise<PDFContent> {
  
  const systemPrompt = `You are a financial document extraction specialist. You are analyzing a PDF document.

Extract ALL content from this PDF, returning structured JSON:

{
  "pageCount": <number of pages you can see>,
  "pages": [
    {
      "pageNumber": 1,
      "text": "All text content from this page, preserving structure with newlines",
      "tables": [
        {
          "title": "Table title if visible",
          "headers": ["Column1", "Column2", "Column3"],
          "rows": [["row1val1", 12345, "row1val3"], ["row2val1", 67890, "row2val3"]],
          "confidence": 0.95
        }
      ]
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Extract content from ALL pages you can see
- Preserve numbers EXACTLY as shown (no rounding, no formatting changes)
- Keep currency symbols (€, $, £) and units (%, months, x, etc.)
- For tables: capture ALL headers and ALL rows with exact values
- European number format (1.234,56) should be preserved exactly as shown
- Focus on financial data: MRR, ARR, Revenue, Customers, Growth, Margins, etc.
- Include narrative text, not just numbers
- Confidence (0-1) reflects how clearly you can read each table`;

  const userPrompt = `Extract all financial data from this PDF document: "${filename}"

Focus especially on:
- Key Performance Indicators (KPIs) and metrics
- Revenue figures (MRR, ARR, Total Revenue, by segment)
- Customer counts, growth rates, churn
- Financial tables, P&L summaries
- Any charts or graphs with numerical data
- Dates and reporting periods

Return the complete JSON structure.`;

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
              type: 'file',
              file: {
                filename: filename,
                file_data: `data:application/pdf;base64,${pdfBase64}`
              }
            } as any // Type assertion for newer API feature
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      console.warn('[PDF Vision] No content returned from GPT-4o');
      return createEmptyResult(1, filename, 'no_response');
    }

    // Parse JSON response
    let parsed: any;
    try {
      // Handle markdown code blocks
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1].trim() : content;
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn('[PDF Vision] JSON parse failed, trying fallback extraction');
      return await extractWithFallback(openai, pdfBase64, filename);
    }

    // Build result
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
        extractionMethod: 'gpt-4o-native-pdf',
        model: 'gpt-4o'
      },
      pages,
      fullText
    };

  } catch (error: any) {
    console.error('[PDF Vision] GPT-4o extraction failed:', error?.message || error);
    
    // If native PDF fails, try image_url approach as fallback
    if (error?.message?.includes('file') || error?.message?.includes('unsupported')) {
      console.log('[PDF Vision] Trying image_url fallback...');
      return await extractWithImageUrl(openai, pdfBase64, filename);
    }
    
    return createEmptyResult(1, filename, 'error');
  }
}

/**
 * Fallback: Use image_url with PDF data URL
 * Some API versions support this format
 */
async function extractWithImageUrl(
  openai: OpenAI,
  pdfBase64: string,
  filename: string
): Promise<PDFContent> {
  
  const systemPrompt = `You are a financial document extraction specialist analyzing a PDF.

Extract ALL content, returning JSON:
{
  "pageCount": <number>,
  "pages": [{"pageNumber": 1, "text": "content", "tables": [...]}]
}

Preserve all numbers exactly. Include all text and tables.`;

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
              text: `Extract all financial data from "${filename}". Return complete JSON.`
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
      return createEmptyResult(1, filename, 'no_response_fallback');
    }

    let parsed: any;
    try {
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1].trim() : content;
      }
      parsed = JSON.parse(jsonStr);
    } catch {
      // Return raw text as single page
      return {
        pageCount: 1,
        info: { filename, extractionMethod: 'gpt-4o-image-url-raw' },
        pages: [{ pageNumber: 1, text: content, tables: [] }],
        fullText: content
      };
    }

    const pages: PDFPage[] = (parsed.pages || []).map((p: any, idx: number) => ({
      pageNumber: p.pageNumber || idx + 1,
      text: p.text || '',
      tables: p.tables || []
    }));

    return {
      pageCount: parsed.pageCount || pages.length,
      info: { filename, extractionMethod: 'gpt-4o-image-url' },
      pages,
      fullText: pages.map(p => p.text).join('\n\n')
    };

  } catch (error: any) {
    console.error('[PDF Vision] Image URL fallback failed:', error?.message);
    return await extractWithFallback(openai, pdfBase64, filename);
  }
}

/**
 * Final fallback: Simple text extraction request
 */
async function extractWithFallback(
  openai: OpenAI,
  pdfBase64: string,
  filename: string
): Promise<PDFContent> {
  console.log('[PDF Vision] Using simple text fallback');
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract financial metrics from a PDF document. Return JSON:
{
  "metrics": [
    {"name": "Metric Name", "value": 12345, "unit": "EUR", "page": 1}
  ],
  "text_summary": "Brief summary of document content"
}`
        },
        {
          role: 'user',
          content: `Document: ${filename} (${Math.round(pdfBase64.length / 1024)}KB)

Please extract all financial KPIs and metrics you can identify. Common metrics include:
- MRR, ARR, Revenue
- Customer counts
- Growth rates
- Margins
- Cash/Runway

Return structured JSON.`
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createEmptyResult(1, filename, 'fallback_no_response');
    }

    const parsed = JSON.parse(content);
    const metrics = parsed.metrics || [];
    
    // Convert metrics to page format
    const text = metrics.map((m: any) => `${m.name}: ${m.value} ${m.unit || ''}`).join('\n');
    const tables: ExtractedTable[] = metrics.length > 0 ? [{
      title: 'Extracted Metrics',
      headers: ['Metric', 'Value', 'Unit'],
      rows: metrics.map((m: any) => [m.name, m.value, m.unit || '']),
      confidence: 0.7
    }] : [];

    return {
      pageCount: 1,
      info: { filename, extractionMethod: 'gpt-4o-fallback' },
      pages: [{
        pageNumber: 1,
        text: parsed.text_summary || text,
        tables
      }],
      fullText: parsed.text_summary || text
    };

  } catch (error) {
    console.error('[PDF Vision] All extraction methods failed:', error);
    return createEmptyResult(1, filename, 'all_failed');
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
