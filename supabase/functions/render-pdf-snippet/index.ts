/**
 * Supabase Edge Function: render-pdf-snippet
 * 
 * Renders PDF pages to PNG images with annotation overlays.
 * Uses magick-wasm (WebAssembly ImageMagick) for serverless compatibility.
 * 
 * This function runs on Supabase Edge (Deno) and can be called from Vercel
 * to offload PDF rendering that requires ImageMagick.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImageMagick, initializeImageMagick, MagickFormat, MagickGeometry, MagickReadSettings } from "npm:@imagemagick/magick-wasm@0.0.30";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Initialize ImageMagick WASM
let magickInitialized = false;

async function ensureMagickInitialized() {
  if (!magickInitialized) {
    const wasmBytes = await Deno.readFile(
      new URL(
        "magick.wasm",
        import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"),
      ),
    );
    await initializeImageMagick(wasmBytes);
    magickInitialized = true;
    console.log('[MagickWasm] Initialized successfully');
  }
}

interface Annotation {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  color?: string;
}

interface RenderRequest {
  // Source: either storage path or base64 PDF
  storagePath?: string;
  pdfBase64?: string;
  
  // Page to render (1-indexed)
  pageNumber: number;
  
  // Output settings
  dpi?: number;        // Default 150
  width?: number;      // Max width in pixels
  height?: number;     // Max height in pixels
  format?: 'png' | 'jpeg';
  
  // Annotations to draw
  annotations?: Annotation[];
  
  // Crop region (optional) - percentages 0-1
  cropRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Output destination
  outputPath?: string;  // If provided, saves to Supabase Storage
}

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const body: RenderRequest = await req.json();
    
    // Validate input
    if (!body.storagePath && !body.pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'Either storagePath or pdfBase64 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Initialize ImageMagick
    await ensureMagickInitialized();
    
    // Get PDF data
    let pdfBuffer: Uint8Array;
    
    if (body.pdfBase64) {
      // Decode base64
      const binaryString = atob(body.pdfBase64);
      pdfBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        pdfBuffer[i] = binaryString.charCodeAt(i);
      }
    } else if (body.storagePath) {
      // Download from Supabase Storage
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Parse bucket and path
      const parts = body.storagePath.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Failed to download PDF: ${error?.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      pdfBuffer = new Uint8Array(await data.arrayBuffer());
    } else {
      return new Response(
        JSON.stringify({ error: 'No PDF source provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Render settings
    const dpi = body.dpi || 150;
    const pageNumber = body.pageNumber || 1;
    const format = body.format || 'png';
    
    console.log(`[Render] Processing PDF, page ${pageNumber}, dpi ${dpi}`);
    
    // Use ImageMagick to render PDF page
    let outputBuffer: Uint8Array | null = null;
    
    const settings = new MagickReadSettings();
    settings.format = MagickFormat.Pdf;
    settings.density = new MagickGeometry(dpi, dpi);

    ImageMagick.read(pdfBuffer, settings, (images) => {
      // PDF pages are separate images in the collection
      const pageIndex = pageNumber - 1;
      
      if (pageIndex >= images.length) {
        throw new Error(`Page ${pageNumber} not found. PDF has ${images.length} pages.`);
      }
      
      const image = images[pageIndex];
      
      // Get dimensions
      const pageWidth = image.width;
      const pageHeight = image.height;
      
      console.log(`[Render] Page dimensions: ${pageWidth}x${pageHeight}`);
      
      // Resize if needed
      if (body.width || body.height) {
        const geometry = new MagickGeometry(body.width || 0, body.height || 0);
        image.resize(geometry);
      }
      
      // Crop if region specified
      if (body.cropRegion) {
        const cropX = Math.round(body.cropRegion.x * pageWidth);
        const cropY = Math.round(body.cropRegion.y * pageHeight);
        const cropW = Math.round(body.cropRegion.width * pageWidth);
        const cropH = Math.round(body.cropRegion.height * pageHeight);
        
        image.crop(new MagickGeometry(cropX, cropY, cropW, cropH));
      }
      
      // Draw annotations using drawing context
      if (body.annotations && body.annotations.length > 0) {
        for (const ann of body.annotations) {
          // Convert percentage coordinates to pixels
          const x = Math.round(ann.x * pageWidth);
          const y = Math.round(ann.y * pageHeight);
          const w = Math.round(ann.width * pageWidth);
          const h = Math.round(ann.height * pageHeight);
          
          // Draw ellipse using draw command
          const color = ann.color || '#FF6B00';
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rx = w / 2 + 10;
          const ry = h / 2 + 5;
          
          // Use ImageMagick draw command
          image.draw((ctx) => {
            ctx.strokeColor(color);
            ctx.strokeWidth(3);
            ctx.fillColor('none');
            ctx.ellipse(cx, cy, rx, ry);
          });
        }
      }
      
      // Convert to output format
      const outputFormat = format === 'jpeg' ? MagickFormat.Jpeg : MagickFormat.Png;
      image.write(outputFormat, (data) => {
        outputBuffer = data;
      });
    });
    
    if (!outputBuffer) {
      return new Response(
        JSON.stringify({ error: 'Failed to render PDF page' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Render] Output buffer size: ${outputBuffer.length} bytes`);
    
    // Save to storage if path provided
    if (body.outputPath) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const parts = body.outputPath.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, outputBuffer, {
          contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
          upsert: true
        });
      
      if (uploadError) {
        return new Response(
          JSON.stringify({ error: `Failed to upload: ${uploadError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Return storage URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          url: urlData.publicUrl,
          path: body.outputPath 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Return image directly
    return new Response(outputBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': format === 'jpeg' ? 'image/jpeg' : 'image/png',
        'Content-Length': outputBuffer.length.toString()
      }
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error rendering PDF:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
