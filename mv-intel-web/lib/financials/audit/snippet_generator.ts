import sharp from 'sharp';

export interface CropCoordinates {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Generates a cropped image snippet from a source page image.
 * Useful for audit trails showing exactly where a number came from.
 * 
 * @param pageImageBuffer Buffer of the full page image (PNG/JPG)
 * @param coords Coordinates to crop (pixels)
 * @returns Buffer of the cropped image (PNG)
 */
export async function generateSnippet(
  pageImageBuffer: Buffer,
  coords: CropCoordinates
): Promise<Buffer> {
  try {
    const image = sharp(pageImageBuffer);
    
    // Validate metadata if needed
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    // Ensure coords are within bounds
    const left = Math.max(0, Math.round(coords.left));
    const top = Math.max(0, Math.round(coords.top));
    const width = Math.min(metadata.width - left, Math.round(coords.width));
    const height = Math.min(metadata.height - top, Math.round(coords.height));

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid crop dimensions');
    }

    const snippet = await image
      .extract({ left, top, width, height })
      .png()
      .toBuffer();

    return snippet;
  } catch (error) {
    console.error('Error generating snippet:', error);
    throw new Error('Failed to generate audit snippet.');
  }
}

/**
 * Highlight a specific region in the image with a red box.
 */
export async function highlightRegion(
  pageImageBuffer: Buffer,
  coords: CropCoordinates
): Promise<Buffer> {
  try {
    // Sharp uses SVG composition for overlays usually
    const rectSvg = `
      <svg width="${coords.width}" height="${coords.height}">
        <rect x="0" y="0" width="${coords.width}" height="${coords.height}" 
              style="fill:none;stroke:red;stroke-width:2;opacity:0.8" />
      </svg>
    `;

    const image = sharp(pageImageBuffer);
    
    const highlighted = await image
      .composite([{
        input: Buffer.from(rectSvg),
        top: Math.round(coords.top),
        left: Math.round(coords.left),
      }])
      .png()
      .toBuffer();

    return highlighted;
  } catch (error) {
    console.error('Error highlighting region:', error);
    throw new Error('Failed to highlight region.');
  }
}



