import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client with service role key
// This bypasses RLS policies entirely
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    // Create admin client for each request to ensure fresh connection
    const supabase = createClient(supabaseUrl, supabaseKey);

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

