import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Annotation to highlight where a value was extracted from
 */
export interface SourceAnnotation {
  label: string;           // e.g., "MRR", "ARR"
  value: string | number;  // The extracted value
  // Bounding box as percentage of page (0-1 range)
  // This allows coordinates to work regardless of page size
  bbox?: {
    x: number;      // Left edge (0 = left, 1 = right)
    y: number;      // Top edge (0 = top, 1 = bottom)
    width: number;  // Width as percentage
    height: number; // Height as percentage
  };
  // Alternative: approximate location if bbox not available
  location?: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
}

/**
 * Extracts a single page from a PDF buffer and returns it as a new PDF buffer.
 * Optionally adds annotation circles/highlights to show where values were extracted.
 */
export async function extractPageSnippet(
    pdfBuffer: Buffer, 
    pageNumber: number, // 1-based index
    annotations?: SourceAnnotation[]
): Promise<Buffer> {
    try {
        const srcDoc = await PDFDocument.load(pdfBuffer);
        const snippetDoc = await PDFDocument.create();
        
        // Copy the page (indices are 0-based)
        const [page] = await snippetDoc.copyPages(srcDoc, [pageNumber - 1]);
        snippetDoc.addPage(page);
        
        // Add annotations if provided
        if (annotations && annotations.length > 0) {
            const addedPage = snippetDoc.getPages()[0];
            const { width, height } = addedPage.getSize();
            const font = await snippetDoc.embedFont(StandardFonts.Helvetica);
            
            // Motive brand colors
            const highlightColor = rgb(0.2, 0.6, 0.9);  // Blue
            const labelBgColor = rgb(1, 0.95, 0.8);     // Light yellow
            const textColor = rgb(0.1, 0.1, 0.1);       // Dark gray
            
            for (let i = 0; i < annotations.length; i++) {
                const annotation = annotations[i];
                let x: number, y: number, boxWidth: number, boxHeight: number;
                
                if (annotation.bbox) {
                    // Use precise bounding box (convert from percentage to absolute)
                    x = annotation.bbox.x * width;
                    // PDF coordinates are bottom-up, so flip Y
                    y = height - (annotation.bbox.y * height) - (annotation.bbox.height * height);
                    boxWidth = annotation.bbox.width * width;
                    boxHeight = annotation.bbox.height * height;
                } else {
                    // Use approximate location
                    const margin = 50;
                    boxWidth = 120;
                    boxHeight = 30;
                    
                    switch (annotation.location) {
                        case 'top-left':
                            x = margin;
                            y = height - margin - boxHeight;
                            break;
                        case 'top-right':
                            x = width - margin - boxWidth;
                            y = height - margin - boxHeight;
                            break;
                        case 'bottom-left':
                            x = margin;
                            y = margin;
                            break;
                        case 'bottom-right':
                            x = width - margin - boxWidth;
                            y = margin;
                            break;
                        case 'center':
                        default:
                            x = (width - boxWidth) / 2;
                            y = (height - boxHeight) / 2;
                            break;
                    }
                    
                    // Offset each annotation slightly to avoid overlap
                    y -= i * 40;
                }
                
                // Draw highlight circle/ellipse around the value
                const centerX = x + boxWidth / 2;
                const centerY = y + boxHeight / 2;
                const radiusX = Math.max(boxWidth / 2 + 10, 40);
                const radiusY = Math.max(boxHeight / 2 + 5, 20);
                
                // Draw ellipse border (approximated with bezier curves)
                drawEllipse(addedPage, centerX, centerY, radiusX, radiusY, highlightColor, 2);
                
                // Draw label with background
                const labelText = `${annotation.label}: ${annotation.value}`;
                const labelFontSize = 8;
                const labelWidth = font.widthOfTextAtSize(labelText, labelFontSize);
                const labelHeight = labelFontSize + 4;
                const labelX = centerX - labelWidth / 2;
                const labelY = centerY + radiusY + 5;
                
                // Label background
                addedPage.drawRectangle({
                    x: labelX - 4,
                    y: labelY - 2,
                    width: labelWidth + 8,
                    height: labelHeight,
                    color: labelBgColor,
                    borderColor: highlightColor,
                    borderWidth: 1,
                });
                
                // Label text
                addedPage.drawText(labelText, {
                    x: labelX,
                    y: labelY,
                    size: labelFontSize,
                    font,
                    color: textColor,
                });
            }
        }
        
        const snippetBytes = await snippetDoc.save();
        return Buffer.from(snippetBytes);
    } catch (error) {
        console.error('Error extracting page snippet:', error);
        throw new Error(`Failed to extract page ${pageNumber} from PDF`);
    }
}

/**
 * Draw an ellipse on a PDF page using bezier curves
 * PDF doesn't have native ellipse support, so we approximate with curves
 */
function drawEllipse(
    page: any,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: { red: number; green: number; blue: number },
    lineWidth: number
) {
    // Bezier approximation of ellipse (4 curves)
    const k = 0.5522848; // Magic number for bezier circle approximation
    const kx = k * rx;
    const ky = k * ry;
    
    // Draw 4 bezier curves to form ellipse
    // Top-right quadrant
    page.drawSvgPath(
        `M ${cx} ${cy + ry} ` +
        `C ${cx + kx} ${cy + ry} ${cx + rx} ${cy + ky} ${cx + rx} ${cy} ` +
        `C ${cx + rx} ${cy - ky} ${cx + kx} ${cy - ry} ${cx} ${cy - ry} ` +
        `C ${cx - kx} ${cy - ry} ${cx - rx} ${cy - ky} ${cx - rx} ${cy} ` +
        `C ${cx - rx} ${cy + ky} ${cx - kx} ${cy + ry} ${cx} ${cy + ry}`,
        {
            borderColor: color,
            borderWidth: lineWidth,
        }
    );
}

/**
 * Extract page with automatic annotation based on extracted line items
 * This is a convenience wrapper that creates annotations from line items
 */
export async function extractPageWithHighlights(
    pdfBuffer: Buffer,
    pageNumber: number,
    lineItems: Array<{
        line_item_id: string;
        amount: number;
        source_location: {
            bbox?: { x: number; y: number; width: number; height: number };
        };
    }>
): Promise<Buffer> {
    // Filter line items for this page and create annotations
    const annotations: SourceAnnotation[] = lineItems
        .filter(item => item.source_location.bbox)
        .map(item => ({
            label: item.line_item_id.replace(/_/g, ' ').toUpperCase(),
            value: item.amount.toLocaleString(),
            bbox: item.source_location.bbox
        }));
    
    return extractPageSnippet(pdfBuffer, pageNumber, annotations);
}


