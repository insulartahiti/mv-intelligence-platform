/**
 * Screenshot-based Snippet Generator
 * 
 * Renders PDF pages to high-resolution PNG images and crops to show
 * the relevant region with context around extracted values.
 * 
 * Uses pdf2pic for PDF-to-image conversion (requires GraphicsMagick locally)
 * Falls back to full-page PDF if rendering fails (e.g., on Vercel)
 */

import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export interface SnippetRegion {
  pageNumber: number;
  // Bounding box as percentage of page (0-1 range)
  bbox?: {
    x: number;      // Left edge
    y: number;      // Top edge  
    width: number;
    height: number;
  };
  label?: string;
  value?: string | number;
}

export interface SnippetOptions {
  /** Scale factor for rendering (default: 2 for high DPI) */
  scale?: number;
  /** Padding around the region as percentage (default: 0.1 = 10%) */
  padding?: number;
  /** Maximum width of output image in pixels (default: 1200) */
  maxWidth?: number;
  /** Whether to draw highlight box around the region (default: true) */
  drawHighlight?: boolean;
}

const DEFAULT_OPTIONS: Required<SnippetOptions> = {
  scale: 2,
  padding: 0.15, // 15% padding for context
  maxWidth: 1200,
  drawHighlight: true
};

/**
 * Generate a screenshot snippet from a PDF page
 * Renders the page to PNG and optionally crops to a specific region
 */
export async function generateScreenshotSnippet(
  pdfBuffer: Buffer,
  region: SnippetRegion,
  options: SnippetOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Get PDF page dimensions
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPage(region.pageNumber - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Calculate render dimensions
    const renderWidth = Math.round(pageWidth * opts.scale);
    const renderHeight = Math.round(pageHeight * opts.scale);
    
    // Convert PDF page to image
    const converter = fromBuffer(pdfBuffer, {
      density: 150 * opts.scale, // DPI
      saveFilename: 'snippet',
      savePath: '/tmp',
      format: 'png',
      width: renderWidth,
      height: renderHeight
    });
    
    const result = await converter(region.pageNumber, { responseType: 'buffer' });
    
    if (!result.buffer) {
      throw new Error('PDF rendering returned no buffer');
    }
    
    let imageBuffer = result.buffer as Buffer;
    
    // If we have a bbox, crop to that region with padding
    if (region.bbox) {
      imageBuffer = await cropToRegion(
        imageBuffer,
        region.bbox,
        renderWidth,
        renderHeight,
        opts.padding,
        opts.maxWidth,
        opts.drawHighlight,
        region.label,
        region.value
      );
    } else {
      // Just resize if needed
      const metadata = await sharp(imageBuffer).metadata();
      if (metadata.width && metadata.width > opts.maxWidth) {
        imageBuffer = await sharp(imageBuffer)
          .resize(opts.maxWidth)
          .png()
          .toBuffer();
      }
    }
    
    return imageBuffer;
    
  } catch (error: any) {
    console.error('[Screenshot] PDF rendering failed:', error.message);
    // Fallback: return a placeholder or throw
    throw new Error(`Screenshot generation failed: ${error.message}`);
  }
}

/**
 * Crop image to a specific region with padding and optional highlight
 */
async function cropToRegion(
  imageBuffer: Buffer,
  bbox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  padding: number,
  maxWidth: number,
  drawHighlight: boolean,
  label?: string,
  value?: string | number
): Promise<Buffer> {
  // Calculate crop region with padding
  const padX = bbox.width * padding;
  const padY = bbox.height * padding;
  
  // Expand region for context (minimum 20% of page or 3x the bbox)
  const contextMultiplier = 3;
  const minContextWidth = imageWidth * 0.3;
  const minContextHeight = imageHeight * 0.3;
  
  let cropWidth = Math.max(bbox.width * imageWidth * contextMultiplier, minContextWidth);
  let cropHeight = Math.max(bbox.height * imageHeight * contextMultiplier, minContextHeight);
  
  // Center the crop on the bbox
  const bboxCenterX = (bbox.x + bbox.width / 2) * imageWidth;
  const bboxCenterY = (bbox.y + bbox.height / 2) * imageHeight;
  
  let cropX = Math.max(0, bboxCenterX - cropWidth / 2);
  let cropY = Math.max(0, bboxCenterY - cropHeight / 2);
  
  // Ensure crop doesn't exceed image bounds
  if (cropX + cropWidth > imageWidth) {
    cropX = Math.max(0, imageWidth - cropWidth);
  }
  if (cropY + cropHeight > imageHeight) {
    cropY = Math.max(0, imageHeight - cropHeight);
  }
  
  cropWidth = Math.min(cropWidth, imageWidth - cropX);
  cropHeight = Math.min(cropHeight, imageHeight - cropY);
  
  // Round to integers
  cropX = Math.round(cropX);
  cropY = Math.round(cropY);
  cropWidth = Math.round(cropWidth);
  cropHeight = Math.round(cropHeight);
  
  let image = sharp(imageBuffer);
  
  // Extract the region
  image = image.extract({
    left: cropX,
    top: cropY,
    width: cropWidth,
    height: cropHeight
  });
  
  // Add highlight overlay if requested
  if (drawHighlight) {
    // Calculate highlight box position relative to cropped image
    const highlightX = Math.round((bbox.x * imageWidth) - cropX);
    const highlightY = Math.round((bbox.y * imageHeight) - cropY);
    const highlightW = Math.round(bbox.width * imageWidth);
    const highlightH = Math.round(bbox.height * imageHeight);
    
    // Create SVG overlay with highlight box and label
    const labelText = label ? `${label}: ${value ?? ''}` : '';
    const svgOverlay = `
      <svg width="${cropWidth}" height="${cropHeight}">
        <!-- Highlight rectangle -->
        <rect 
          x="${highlightX - 5}" 
          y="${highlightY - 5}" 
          width="${highlightW + 10}" 
          height="${highlightH + 10}"
          fill="none"
          stroke="#3B82F6"
          stroke-width="3"
          rx="4"
        />
        <!-- Label background -->
        ${labelText ? `
        <rect
          x="${highlightX - 5}"
          y="${highlightY - 30}"
          width="${Math.max(labelText.length * 8, 100)}"
          height="24"
          fill="#3B82F6"
          rx="4"
        />
        <text
          x="${highlightX + 5}"
          y="${highlightY - 12}"
          font-family="Arial, sans-serif"
          font-size="14"
          font-weight="bold"
          fill="white"
        >${labelText}</text>
        ` : ''}
      </svg>
    `;
    
    image = image.composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0
    }]);
  }
  
  // Resize if too large
  const metadata = await image.metadata();
  if (metadata.width && metadata.width > maxWidth) {
    image = image.resize(maxWidth);
  }
  
  return image.png().toBuffer();
}

/**
 * Generate multiple snippets for a page (one per annotation region)
 * Returns a single composite image showing all highlighted regions
 */
export async function generatePageSnippet(
  pdfBuffer: Buffer,
  pageNumber: number,
  annotations: Array<{
    label: string;
    value: string | number;
    bbox?: { x: number; y: number; width: number; height: number };
  }>,
  options: SnippetOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Get PDF page dimensions
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPage(pageNumber - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Calculate render dimensions (higher resolution for full page)
    const renderWidth = Math.round(pageWidth * opts.scale);
    const renderHeight = Math.round(pageHeight * opts.scale);
    
    // Convert PDF page to image
    const converter = fromBuffer(pdfBuffer, {
      density: 150 * opts.scale,
      saveFilename: 'snippet',
      savePath: '/tmp',
      format: 'png',
      width: renderWidth,
      height: renderHeight
    });
    
    const result = await converter(pageNumber, { responseType: 'buffer' });
    
    if (!result.buffer) {
      throw new Error('PDF rendering returned no buffer');
    }
    
    let imageBuffer = result.buffer as Buffer;
    
    // Create SVG overlay with all annotations
    if (annotations.length > 0) {
      const svgParts: string[] = [];
      
      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        if (!ann.bbox) continue;
        
        const x = Math.round(ann.bbox.x * renderWidth);
        const y = Math.round(ann.bbox.y * renderHeight);
        const w = Math.round(ann.bbox.width * renderWidth);
        const h = Math.round(ann.bbox.height * renderHeight);
        
        const labelText = `${ann.label}: ${ann.value}`;
        
        // Alternate colors for different annotations
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        const color = colors[i % colors.length];
        
        svgParts.push(`
          <!-- Highlight for ${ann.label} -->
          <rect 
            x="${x - 3}" y="${y - 3}" 
            width="${w + 6}" height="${h + 6}"
            fill="none" stroke="${color}" stroke-width="3" rx="4"
          />
          <rect
            x="${x - 3}" y="${y - 28}"
            width="${Math.max(labelText.length * 7 + 10, 80)}" height="22"
            fill="${color}" rx="3"
          />
          <text
            x="${x + 5}" y="${y - 11}"
            font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white"
          >${labelText}</text>
        `);
      }
      
      const svgOverlay = `
        <svg width="${renderWidth}" height="${renderHeight}">
          ${svgParts.join('\n')}
        </svg>
      `;
      
      imageBuffer = await sharp(imageBuffer)
        .composite([{
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0
        }])
        .toBuffer();
    }
    
    // Resize to max width
    const metadata = await sharp(imageBuffer).metadata();
    if (metadata.width && metadata.width > opts.maxWidth) {
      imageBuffer = await sharp(imageBuffer)
        .resize(opts.maxWidth)
        .png()
        .toBuffer();
    }
    
    return imageBuffer;
    
  } catch (error: any) {
    console.error('[Screenshot] Page snippet generation failed:', error.message);
    throw new Error(`Page snippet generation failed: ${error.message}`);
  }
}

/**
 * Check if PDF rendering is available (GraphicsMagick/ImageMagick installed)
 * Returns false on Vercel/serverless environments
 */
export async function isRenderingAvailable(): Promise<boolean> {
  // Serverless environments don't have GraphicsMagick
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    console.log('[Screenshot] Serverless environment detected, PDF rendering disabled');
    return false;
  }
  
  try {
    // Create a minimal test PDF
    const testDoc = await PDFDocument.create();
    testDoc.addPage([100, 100]);
    const testBuffer = Buffer.from(await testDoc.save());
    
    const converter = fromBuffer(testBuffer, {
      density: 72,
      saveFilename: 'test',
      savePath: '/tmp',
      format: 'png',
      width: 100,
      height: 100
    });
    
    await converter(1, { responseType: 'buffer' });
    return true;
  } catch (error) {
    console.warn('[Screenshot] PDF rendering not available:', error);
    return false;
  }
}

