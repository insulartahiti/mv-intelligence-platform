// Polyfill DOMMatrix for Node.js/serverless environments
// pdfjs-dist (used by pdf-parse) requires this browser API
if (typeof globalThis.DOMMatrix === 'undefined') {
  // Minimal DOMMatrix polyfill for PDF text extraction (not full spec)
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    
    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    
    multiply() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    transformPoint(point: any) { return point; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
  };
}

// import pdf from 'pdf-parse';
// const pdf = require('pdf-parse'); // Moved inside function for safety
import { FileMetadata } from './load_file';

export interface PDFPage {
  pageNumber: number;
  text: string;
}

export interface PDFContent {
  pageCount: number;
  info: any;
  pages: PDFPage[];
  fullText: string;
}

export async function parsePDF(file: FileMetadata): Promise<PDFContent> {
  const dataBuffer = file.buffer;

  // Lazy load pdf-parse to prevent module-level crashes in serverless
  let pdf;
  try {
    pdf = require('pdf-parse');
  } catch (err: any) {
    console.error('Failed to load pdf-parse module:', err);
    throw new Error(`PDF parsing module not available: ${err?.message || err}`);
  }

  // Validate we have a valid buffer
  if (!dataBuffer || dataBuffer.length === 0) {
    throw new Error('PDF file is empty or could not be read');
  }
  
  console.log(`[PDF] Parsing file: ${file.filename}, size: ${dataBuffer.length} bytes`);

  try {
    const pages: PDFPage[] = [];
    
    // We use a custom render callback to capture text per page.
    const options = {
      // Limit max pages to prevent timeouts on large PDFs
      max: 50,
      pagerender: async (pageData: any) => {
        try {
          const textContent = await pageData.getTextContent();
          
          let lastY: number | undefined, text = '';
          for (const item of textContent.items) {
            if (!lastY || Math.abs(item.transform[5] - lastY) < 10) {
               text += item.str;
            } else {
               text += '\n' + item.str;
            }                                   
            lastY = item.transform[5];
          }
          
          pages.push({
              pageNumber: pageData.pageIndex + 1,
              text: text
          });
          
          return text;
        } catch (pageErr: any) {
          console.warn(`[PDF] Error rendering page ${pageData.pageIndex + 1}:`, pageErr?.message);
          return ''; // Continue with other pages
        }
      }
    };

    const data = await pdf(dataBuffer, options);

    pages.sort((a, b) => a.pageNumber - b.pageNumber);
    
    console.log(`[PDF] Successfully parsed ${data.numpages} pages, extracted ${pages.length} with text`);

    return {
      pageCount: data.numpages,
      info: data.info,
      fullText: data.text,
      pages: pages
    };
  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    // Include more details in the error message for debugging
    const errorMsg = error?.message || String(error);
    throw new Error(`Failed to parse PDF file: ${errorMsg}`);
  }
}

/**
 * Helper to find specific pages based on content hints (anchors).
 * Used when a guide specifies "anchor_text" for finding a table.
 */
export function findPagesWithKeywords(pdfContent: PDFContent, keywords: string[]): number[] {
  const matchedPages: number[] = [];
  
  for (const page of pdfContent.pages) {
    // Check if ALL keywords are present
    const hasAll = keywords.every(kw => page.text.toLowerCase().includes(kw.toLowerCase()));
    if (hasAll) {
      matchedPages.push(page.pageNumber);
    }
  }
  
  return matchedPages;
}
