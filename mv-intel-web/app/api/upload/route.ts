import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to create Supabase client lazily (inside handler, not at module load time)
// This prevents Vercel build failures when env vars aren't available during build
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET: Generate a signed upload URL for direct client-to-storage upload
 * This bypasses Vercel's 4.5MB payload limit by having the client upload directly to Supabase
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename');
    const companySlug = searchParams.get('companySlug');

    if (!filename || !companySlug) {
      return NextResponse.json({ 
        error: 'Missing filename or companySlug',
        status: 'error'
      }, { status: 400 });
    }

    // Create admin client (lazy init to avoid build-time env var issues)
    const supabase = getSupabaseClient();

    // Generate unique path
    const timestamp = Date.now();
    const relativePath = `${companySlug}/${timestamp}_${filename}`;

    // Create signed upload URL (valid for 60 seconds)
    const { data, error } = await supabase.storage
      .from('financial-docs')
      .createSignedUploadUrl(relativePath);

    if (error) {
      console.error('Signed URL error:', error);
      return NextResponse.json({ 
        error: `Failed to create upload URL: ${error.message}`,
        status: 'error'
      }, { status: 500 });
    }

    // Return the signed URL and the final path
    const fullPath = `financial-docs/${relativePath}`;
    
    return NextResponse.json({
      status: 'success',
      signedUrl: data.signedUrl,
      token: data.token,
      path: fullPath,
      filename: filename
    });

  } catch (error: any) {
    console.error('Upload URL generation error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to generate upload URL',
      status: 'error'
    }, { status: 500 });
  }
}

/**
 * POST: Fallback for smaller files (under 4MB) - direct upload through API
 * This is kept as a fallback but the frontend should prefer signed URLs
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const companySlug = formData.get('companySlug') as string;

    if (!file || !companySlug) {
      return NextResponse.json({ 
        error: 'Missing file or companySlug',
        status: 'error'
      }, { status: 400 });
    }

    // Create admin client (lazy init to avoid build-time env var issues)
    const supabase = getSupabaseClient();

    // Generate unique path
    const timestamp = Date.now();
    const relativePath = `${companySlug}/${timestamp}_${file.name}`;

    // Convert File to ArrayBuffer then to Buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload using service role (bypasses RLS)
    const { data, error } = await supabase.storage
      .from('financial-docs')
      .upload(relativePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json({ 
        error: `Upload failed: ${error.message}`,
        status: 'error'
      }, { status: 500 });
    }

    // Return the full logical path used by the ingestion backend
    const fullPath = `financial-docs/${relativePath}`;
    
    return NextResponse.json({
      status: 'success',
      path: fullPath,
      filename: file.name
    });

  } catch (error: any) {
    console.error('Upload route error:', error);
    return NextResponse.json({ 
      error: error.message || 'Upload failed',
      status: 'error'
    }, { status: 500 });
  }
}
