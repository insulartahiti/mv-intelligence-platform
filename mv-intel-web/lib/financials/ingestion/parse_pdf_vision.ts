/**
 * Vision-based PDF Parser using Puppeteer
 * 
 * Uses headless Chrome (via Puppeteer) to render PDF pages as screenshots,
 * then sends images to GPT-4 Vision for high-quality extraction.
 * 
 * This approach:
 * - Works in Vercel serverless (using @sparticuz/chromium)
 * - Renders PDFs exactly as they appear
 * - Handles complex layouts, charts, tables perfectly
 * - No native binary issues (Chromium is bundled)
 */

import OpenAI from 'openai';
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
 * Convert PDF pages to images using Puppeteer headless browser
 */
async function convertPdfToImages(pdfBuffer: Buffer): Promise<{ pageNumber: number; base64: string }[]> {
  // Dynamic imports for serverless compatibility
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');
  
  // Configure chromium for serverless
  chromium.default.setHeadlessMode = true;
  chromium.default.setGraphicsMode = false;
  
  const browser = await puppeteer.default.launch({
    args: chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath: await chromium.default.executablePath(),
    headless: chromium.default.headless,
  });
  
  const pageImages: { pageNumber: number; base64: string }[] = [];
  
  try {
    const page = await browser.newPage();
    
    // Set viewport for good quality screenshots
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    
    // Convert PDF buffer to data URL
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
    
    // Navigate to PDF (Chrome's built-in PDF viewer)
    await page.goto(pdfDataUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for PDF to render
    await page.waitForTimeout(2000);
    
    // Get page count from PDF viewer
    // Chrome's PDF viewer exposes page count in the toolbar
    let pageCount = 1;
    try {
      // Try to get page count from PDF.js viewer
      pageCount = await page.evaluate(() => {
        // @ts-ignore - accessing PDF viewer internals
        const viewer = (window as any).PDFViewerApplication;
        if (viewer && viewer.pagesCount) {
          return viewer.pagesCount;
        }
        // Fallback: count page elements
        const pages = document.querySelectorAll('.page');
        return pages.length || 1;
      });
    } catch {
      console.log('[PDF Puppeteer] Could not determine page count, using 1');
    }
    
    console.log(`[PDF Puppeteer] PDF has ${pageCount} pages`);
    
    // Limit pages for cost control
    const maxPages = Math.min(pageCount, 15);
    
    // Take screenshots of each page
    for (let i = 1; i <= maxPages; i++) {
      try {
        // Navigate to specific page in PDF viewer
        await page.evaluate((pageNum) => {
          // @ts-ignore
          const viewer = (window as any).PDFViewerApplication;
          if (viewer && viewer.page !== undefined) {
            viewer.page = pageNum;
          }
        }, i);
        
        await page.waitForTimeout(500); // Wait for page to render
        
        // Take screenshot
        const screenshot = await page.screenshot({
          type: 'png',
          fullPage: false,
          encoding: 'base64'
        });
        
        pageImages.push({
          pageNumber: i,
          base64: screenshot as string
        });
        
        console.log(`[PDF Puppeteer] Captured page ${i}/${maxPages}`);
      } catch (pageErr) {
        console.warn(`[PDF Puppeteer] Failed to capture page ${i}:`, pageErr);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  return pageImages;
}

/**
 * Alternative: Render PDF using HTML embed for simpler approach
 */
async function convertPdfToImagesSimple(pdfBuffer: Buffer): Promise<{ pageNumber: number; base64: string }[]> {
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');
  
  const browser = await puppeteer.default.launch({
    args: [...chromium.default.args, '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 2 },
    executablePath: await chromium.default.executablePath(),
    headless: true,
  });
  
  const pageImages: { pageNumber: number; base64: string }[] = [];
  
  try {
    const page = await browser.newPage();
    
    // Create HTML page with PDF embedded
    const pdfBase64 = pdfBuffer.toString('base64');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: white; }
          embed { width: 100%; height: 100vh; }
        </style>
      </head>
      <body>
        <embed src="data:application/pdf;base64,${pdfBase64}" type="application/pdf" />
      </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(3000); // Wait for PDF to render
    
    // Take full page screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
      encoding: 'base64'
    });
    
    // For now, return as single "page" - we can enhance later
    pageImages.push({
      pageNumber: 1,
      base64: screenshot as string
    });
    
    console.log(`[PDF Puppeteer] Captured PDF as single screenshot`);
    
  } finally {
    await browser.close();
  }
  
  return pageImages;
}

/**
 * Parse PDF by rendering to images with Puppeteer and sending to GPT-4 Vision
 */
export async function parsePDFWithVision(file: FileMetadata): Promise<PDFContent> {
  const openai = getOpenAI();
  
  console.log(`[PDF Vision] Starting Puppeteer-based extraction for ${file.filename}`);
  
  let pageImages: { pageNumber: number; base64: string }[] = [];
  
  try {
    // Try the simple approach first (more reliable in serverless)
    pageImages = await convertPdfToImagesSimple(file.buffer);
  } catch (err: any) {
    console.error('[PDF Vision] Puppeteer conversion failed:', err.message);
    throw new Error(`PDF rendering failed: ${err.message}`);
  }
  
  if (pageImages.length === 0) {
    throw new Error('No pages could be rendered from PDF');
  }
  
  console.log(`[PDF Vision] Rendered ${pageImages.length} page(s), sending to GPT-4V...`);
  
  // Process pages with GPT-4 Vision
  const pages: PDFPage[] = [];
  const batchSize = 4;
  
  for (let i = 0; i < pageImages.length; i += batchSize) {
    const batch = pageImages.slice(i, i + batchSize);
    const batchResults = await extractFromImageBatch(openai, batch, file.filename);
    pages.push(...batchResults);
  }
  
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  
  const fullText = pages.map(p => p.text).join('\n\n');
  
  console.log(`[PDF Vision] Extraction complete: ${pages.length} pages, ${fullText.length} chars`);
  
  return {
    pageCount: pageImages.length,
    info: { 
      filename: file.filename, 
      extractionMethod: 'puppeteer-gpt4-vision',
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
  
  const systemPrompt = `You are a financial document extraction specialist analyzing screenshots of PDF pages.

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
      text: `Extract all financial data from these ${batch.length} page screenshot(s) (pages ${pageNumbers}) of "${filename}". Return the JSON structure with all text and tables found.`
    }
  ];
  
  // Add each page image
  for (const page of batch) {
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
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        jsonStr = match ? match[1].trim() : content;
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn(`[PDF Vision] JSON parse failed for pages ${pageNumbers}, using raw text`);
      return [{
        pageNumber: batch[0].pageNumber,
        text: content,
        tables: []
      }];
    }

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
    return batch.map(b => ({
      pageNumber: b.pageNumber,
      text: '',
      tables: []
    }));
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
