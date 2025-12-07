/**
 * Legal Document Snippet Generator
 * 
 * Tries to render visual image snippets (screenshots) using pdf-to-img.
 * Falls back to extracting single-page PDFs if image rendering fails.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

// Polyfill for pdfjs-dist in Node environment
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
      constructor(init: any) {
          (this as any).a = 1; (this as any).b = 0; (this as any).c = 0; 
          (this as any).d = 1; (this as any).e = 0; (this as any).f = 0;
          if (Array.isArray(init)) {
              (this as any).a = init[0]; (this as any).b = init[1]; (this as any).c = init[2];
              (this as any).d = init[3]; (this as any).e = init[4]; (this as any).f = init[5];
          }
      }
  } as any;
}

export interface SnippetRegion {
  pageNumber: number; // 1-based index
  bbox?: {
    x: number;      // 0-1 percentage
    y: number;      // 0-1 percentage
    width: number;  // 0-1 percentage
    height: number; // 0-1 percentage
  };
  label?: string;
  color?: string;   // Hex color
}

export interface SnippetOptions {
  scale?: number;
  format?: 'png' | 'pdf'; // Preferred format
}

export interface SnippetOutput {
  buffer: Buffer;
  mimeType: 'image/png' | 'application/pdf';
  extension: 'png' | 'pdf';
}

/**
 * Generate a visual snippet (Image or PDF)
 */
export async function generateLegalSnippet(
  pdfBuffer: Buffer,
  region: SnippetRegion,
  options: SnippetOptions = {}
): Promise<SnippetOutput> {
  // First, extract the single page as a buffer
  let pagePdfBuffer: Buffer;
  
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const subDoc = await PDFDocument.create();
    const [copiedPage] = await subDoc.copyPages(srcDoc, [region.pageNumber - 1]);
    subDoc.addPage(copiedPage);
    pagePdfBuffer = Buffer.from(await subDoc.save());
  } catch (e: any) {
    throw new Error(`Failed to extract page ${region.pageNumber}: ${e.message}`);
  }

  // Try to generate Image (Screenshot)
  // Use dynamic import to avoid build-time evaluation issues with pdf-to-img/pdfjs-dist
  try {
    // Dynamic import inside function
    const { pdf } = await import('pdf-to-img');
    
    const document = await pdf(pagePdfBuffer, { scale: options.scale || 2.0 });
    let imageBuffer: Buffer | null = null;
    
    for await (const page of document) {
      imageBuffer = page;
      break; 
    }
    
    if (imageBuffer) {
      // Process with Sharp to add highlight
      let image = sharp(imageBuffer);
      
      if (region.bbox) {
        const metadata = await image.metadata();
        const imgWidth = metadata.width || 0;
        const imgHeight = metadata.height || 0;
        
        if (imgWidth && imgHeight) {
          const left = Math.round(region.bbox.x * imgWidth);
          const top = Math.round(region.bbox.y * imgHeight);
          const width = Math.round(region.bbox.width * imgWidth);
          const height = Math.round(region.bbox.height * imgHeight);
          
          const color = region.color || '#ffeb3b';
          
          const svgOverlay = `
            <svg width="${imgWidth}" height="${imgHeight}">
              <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="4" />
              ${region.label ? `
                <rect x="${left}" y="${top - 24}" width="${region.label.length * 12 + 20}" height="24" fill="${color}" />
                <text x="${left + 10}" y="${top - 7}" font-family="Arial" font-size="14" fill="black" font-weight="bold">${region.label}</text>
              ` : ''}
            </svg>
          `;
          
          image = image.composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }]);
        }
      }
      
      return {
        buffer: await image.png().toBuffer(),
        mimeType: 'image/png',
        extension: 'png'
      };
    }
  } catch (error) {
    console.warn(`[Snippet] Image rendering failed, falling back to PDF:`, error);
  }
  
  // Fallback: Return annotated PDF
  try {
    const doc = await PDFDocument.load(pagePdfBuffer);
    const page = doc.getPages()[0];
    const { width, height } = page.getSize();
    
    if (region.bbox) {
      const rectX = region.bbox.x * width;
      const rectW = region.bbox.width * width;
      const rectH = region.bbox.height * height;
      const rectY = height - (region.bbox.y * height) - rectH;
      
      page.drawRectangle({
        x: rectX, y: rectY, width: rectW, height: rectH,
        color: rgb(1, 1, 0), opacity: 0.3,
        borderColor: rgb(1, 0.8, 0), borderWidth: 2,
      });
      
      if (region.label) {
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        page.drawText(region.label, {
          x: rectX, y: rectY + rectH + 5, size: 12, font, color: rgb(0, 0, 0),
        });
      }
    }
    
    return {
      buffer: Buffer.from(await doc.save()),
      mimeType: 'application/pdf',
      extension: 'pdf'
    };
  } catch (e: any) {
    throw new Error(`Failed to generate fallback PDF: ${e.message}`);
  }
}

/**
 * Generate a text-only placeholder snippet (for Word docs or non-renderable content)
 */
export async function generateTextSnippet(
  text: string,
  label: string
): Promise<SnippetOutput> {
  const width = 800;
  const height = 400;
  
  // Escape HTML entities for SVG
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
    
  const svg = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#f8f9fa;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e9ecef;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad1)" rx="10" ry="10" stroke="#dee2e6" stroke-width="2" />
      
      <!-- Header -->
      <rect x="0" y="0" width="100%" height="50" fill="#212529" rx="10" ry="10" />
      <rect x="0" y="40" width="100%" height="10" fill="#212529" /> 
      <text x="20" y="32" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#ffffff" font-weight="bold">${label}</text>
      
      <!-- Content Container -->
      <foreignObject x="20" y="70" width="${width - 40}" height="${height - 90}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Courier New', monospace; font-size: 14px; color: #212529; line-height: 1.6; overflow: hidden; background: white; padding: 15px; border: 1px solid #ced4da; border-radius: 4px; height: 100%;">
          ${safeText}
        </div>
      </foreignObject>
    </svg>
  `;
  
  try {
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      buffer,
      mimeType: 'image/png',
      extension: 'png'
    };
  } catch (e: any) {
    throw new Error(`Failed to generate text snippet: ${e.message}`);
  }
}
