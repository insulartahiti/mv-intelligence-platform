import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('companyId') as string;
    const fileType = formData.get('fileType') as string;
    const description = formData.get('description') as string;

    if (!file || !companyId) {
      return NextResponse.json({ 
        error: 'file and companyId are required' 
      }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size must be less than 10MB' 
      }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'File type not supported. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG, GIF' 
      }, { status: 400 });
    }

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer();
    const fileData = Buffer.from(fileBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${companyId}_${timestamp}.${fileExtension}`;

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('portfolio-files')
      .upload(fileName, fileData, {
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('portfolio-files')
      .getPublicUrl(fileName);

    // Store file metadata in database
    const { data: fileRecord, error: dbError } = await admin
      .from('portfolio_files')
      .insert({
        company_id: companyId,
        file_name: file.name,
        file_path: uploadData.path,
        file_url: urlData.publicUrl,
        file_type: fileType || file.type,
        file_size: file.size,
        description: description || null,
        uploaded_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (dbError) {
      // Clean up uploaded file if database insert fails
      await admin.storage
        .from('portfolio-files')
        .remove([fileName]);
      
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      fileId: fileRecord.id,
      fileName: file.name,
      fileUrl: urlData.publicUrl,
      message: 'File uploaded successfully' 
    });

  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ 
      error: 'Failed to upload file: ' + error.message 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const companyId = req.nextUrl.searchParams.get('companyId');
    
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const { data: files, error } = await admin
      .from('portfolio_files')
      .select('*')
      .eq('company_id', companyId)
      .order('uploaded_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ files: files || [] });

  } catch (error: any) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch files: ' + error.message 
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { fileId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    // Get file record
    const { data: fileRecord, error: fetchError } = await admin
      .from('portfolio_files')
      .select('file_path')
      .eq('id', fileId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    // Delete file from storage
    const { error: storageError } = await admin.storage
      .from('portfolio-files')
      .remove([fileRecord.file_path]);

    if (storageError) {
      console.warn('Failed to delete file from storage:', storageError);
    }

    // Delete file record from database
    const { error: dbError } = await admin
      .from('portfolio_files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });

  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ 
      error: 'Failed to delete file: ' + error.message 
    }, { status: 500 });
  }
}






