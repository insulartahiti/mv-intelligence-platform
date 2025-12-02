/**
 * Vision-based PDF Parser
 * 
 * Converts PDF pages to images using pdf-to-img (pure JS, no native deps)
 * then sends images to GPT-4 Vision for high-quality extraction.
 * 
 * This approach provides the best accuracy for:
 * - Complex table layouts
 * - Charts and graphs
 * - Scanned documents
 * - Multi-column layouts
 */

import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';
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
 * Parse PDF by converting pages to images and sending to GPT-4 Vision
 */
export async function parsePDFWithVision(file: FileMetadata): Promise<PDFContent> {
  const openai = getOpenAI();
  
  console.log(`[PDF Vision] Starting image-based extraction for ${file.filename}`);
  
  // Convert PDF pages to images using pdf-to-img
  const pageImages: { pageNumber: number; base64: string }[] = [];
  
  try {
    // pdf-to-img accepts Buffer directly
    const document = await pdf(file.buffer, { 
      scale: 2.0  // Higher scale = better quality for vision
    });
    
    let pageNumber = 1;
    for await (const imageBuffer of document) {
      // Convert to base64 for GPT-4V
      const base64 = imageBuffer.toString('base64');
      pageImages.push({ pageNumber, base64 });
      console.log(`[PDF Vision] Converted page ${pageNumber} to image (${Math.round(base64.length / 1024)}KB)`);
      pageNumber++;
      
      // Limit to first 20 pages for cost control
      if (pageNumber > 20) {
        console.log(`[PDF Vision] Limiting to first 20 pages`);
        break;
      }
    }
  } catch (err: any) {
    console.error('[PDF Vision] Failed to convert PDF to images:', err);
    throw new Error(`PDF to image conversion failed: ${err.message}`);
  }
  
  if (pageImages.length === 0) {
    throw new Error('No pages could be extracted from PDF');
  }
  
  console.log(`[PDF Vision] Converted ${pageImages.length} pages to images, sending to GPT-4V...`);
  
  // Process pages in batches of 4 (GPT-4V can handle multiple images)
  const pages: PDFPage[] = [];
  const batchSize = 4;
  
  for (let i = 0; i < pageImages.length; i += batchSize) {
    const batch = pageImages.slice(i, i + batchSize);
    const batchResults = await extractFromImageBatch(openai, batch, file.filename);
    pages.push(...batchResults);
  }
  
  // Sort by page number
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  
  const fullText = pages.map(p => p.text).join('\n\n');
  
  console.log(`[PDF Vision] Extraction complete: ${pages.length} pages, ${fullText.length} chars`);
  
  return {
    pageCount: pageImages.length,
    info: { 
      filename: file.filename, 
      extractionMethod: 'gpt-4-vision-images',
      pagesProcessed: pages.length
    },
    pages,
    fullText
  };
}

/**
 * Send a batch of page images to GPT-4 Vision for extraction
 */
async function extractFromImageBatch(
  openai: OpenAI,
  batch: { pageNumber: number; base64: string }[],
  filename: string
): Promise<PDFPage[]> {
  
  const pageNumbers = batch.map(b => b.pageNumber).join(', ');
  
  const systemPrompt = `You are a financial document extraction specialist analyzing images of PDF pages.

Extract ALL content from each page image, returning structured JSON:

{
  "pages": [
    {
      "pageNumber": 1,
      "text": "All text content from this page, preserving structure",
      "tables": [
        {
          "title": "Table title if visible",
          "headers": ["Col1", "Col2", "Col3"],
          "rows": [["val1", 12345, "val3"], ["val4", 67890, "val6"]],
          "confidence": 0.95
        }
      ]
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Extract ALL visible text, not just tables
- Preserve numbers EXACTLY as shown (no rounding)
- Keep currency symbols (€, $) and units (%, months, etc.)
- For tables: capture headers and all rows with exact values
- European number format (1.234,56) should be preserved as-is
- Include KPIs like MRR, ARR, Revenue, Customers, Growth rates
- Confidence should reflect how clearly you can read the data (0-1)`;

  const userContent: any[] = [
    { 
      type: 'text', 
      text: `Extract all financial data from these ${batch.length} page(s) (pages ${pageNumbers}) of "${filename}". Return the JSON structure with all text and tables found.`
    }
  ];
  
  // Add each page image
  for (const page of batch) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${page.base64}`,
        detail: 'high'  // Use high detail for financial documents
      }
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 8000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      console.warn(`[PDF Vision] No content returned for pages ${pageNumbers}`);
      return batch.map(b => ({
        pageNumber: b.pageNumber,
        text: '',
        tables: []
      }));
    }

    // Parse JSON response
    let parsed: { pages: any[] };
    try {
      // Handle markdown code blocks
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1].trim() : content;
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn(`[PDF Vision] JSON parse failed for pages ${pageNumbers}, using raw text`);
      // Return the raw content as text for the first page in batch
      return [{
        pageNumber: batch[0].pageNumber,
        text: content,
        tables: []
      }];
    }

    // Map parsed pages to our format, matching with batch page numbers
    const results: PDFPage[] = [];
    
    if (parsed.pages && Array.isArray(parsed.pages)) {
      for (const parsedPage of parsed.pages) {
        results.push({
          pageNumber: parsedPage.pageNumber || batch[0].pageNumber,
          text: parsedPage.text || '',
          tables: parsedPage.tables || []
        });
      }
    }
    
    // Ensure we have a result for each page in the batch
    for (const batchPage of batch) {
      if (!results.find(r => r.pageNumber === batchPage.pageNumber)) {
        results.push({
          pageNumber: batchPage.pageNumber,
          text: '',
          tables: []
        });
      }
    }
    
    return results;

  } catch (error: any) {
    console.error(`[PDF Vision] Error extracting pages ${pageNumbers}:`, error?.message || error);
    // Return empty results for failed batch
    return batch.map(b => ({
      pageNumber: b.pageNumber,
      text: '',
      tables: []
    }));
  }
}

/**
 * Extract specific metrics from PDF using Vision
 * More targeted extraction when you know what to look for
 */
export async function extractMetricsFromPDFVision(
  file: FileMetadata,
  metricsToFind: string[]
): Promise<Record<string, { value: number; unit: string; page: number; confidence: number }>> {
  const openai = getOpenAI();
  
  // Convert first few pages to images
  const pageImages: { pageNumber: number; base64: string }[] = [];
  
  try {
    const document = await pdf(file.buffer, { scale: 2.0 });
    let pageNumber = 1;
    
    for await (const imageBuffer of document) {
      pageImages.push({ 
        pageNumber, 
        base64: imageBuffer.toString('base64') 
      });
      pageNumber++;
      if (pageNumber > 10) break; // Limit for targeted extraction
    }
  } catch (err) {
    console.error('[PDF Vision] Failed to convert PDF:', err);
    return {};
  }
  
  const systemPrompt = `You are a financial analyst extracting specific KPIs.
Find these metrics: ${metricsToFind.join(', ')}

Return ONLY a JSON object:
{
  "metric_id": { "value": 123.45, "unit": "EUR", "page": 1, "confidence": 0.95 }
}

Rules:
- Only include metrics you actually found
- Convert European format (1.234,56) to standard (1234.56)
- Use the exact metric IDs provided
- Confidence: 0.9+ for clearly visible, 0.7-0.9 for inferred`;

  const userContent: any[] = [
    { 
      type: 'text', 
      text: `Find these metrics in "${file.filename}": ${metricsToFind.join(', ')}`
    }
  ];
  
  // Add page images (limit to first 5 for targeted search)
  for (const page of pageImages.slice(0, 5)) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${page.base64}`,
        detail: 'high'
      }
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
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
