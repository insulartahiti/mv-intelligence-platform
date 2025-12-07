/**
 * Legal Document Analysis API Endpoint
 * 
 * POST /api/portfolio/legal-analysis
 * Analyzes investor documentation (term sheets, SPAs, SHAs, SAFEs, CLAs, etc.)
 * and extracts structured legal terms.
 * 
 * Supports:
 * - PDF documents (with visual snippet extraction)
 * - Word documents (.docx)
 * - Multiple files with automatic grouping of related documents
 * 
 * Follows the same patterns as /api/ingest for financial documents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  analyzeLegalDocument, 
  analyzeMultipleDocuments,
  classifyFromFilename,
  classifyDocumentCategory
} from '@/lib/legal';
import { LegalAnalysisRequest } from '@/lib/legal/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for mammoth library (Word doc processing)
export const maxDuration = 300; // 5 minutes for complex documents

// Initialize Supabase client inside handler to avoid build issues
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(url, key);
}

// =============================================================================
// POST: Analyze a legal document
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    // Validate environment
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    const body = await req.json();
    const { 
      // Single file mode
      storagePath, 
      fileBase64, 
      filename, 
      // Multiple files mode
      files, // Array of { filename, fileBase64 }
      // Common options
      companyId, 
      companySlug,
      dryRun = false 
    } = body;
    
    // Resolve company ID if slug provided
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId && companySlug) {
      const supabase = getSupabase();
      const { data: entity } = await supabase
        .from('graph.entities')
        .select('id')
        .or(`slug.eq.${companySlug},name.ilike.%${companySlug}%`)
        .limit(1)
        .single();
        
      if (entity) {
        resolvedCompanyId = entity.id;
      }
    }
    
    // MULTIPLE FILES MODE
    if (files && Array.isArray(files) && files.length > 0) {
      console.log(`[Legal API] Processing ${files.length} files with automatic grouping`);
      
      // Validate and prepare files
      const preparedFiles: { filename: string; buffer: Buffer }[] = [];
      
      for (const file of files) {
        if (!file.filename || !file.fileBase64) {
          continue;
        }
        
        const ext = file.filename.toLowerCase();
        if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc')) {
          console.warn(`[Legal API] Skipping unsupported file: ${file.filename}`);
          continue;
        }
        
        preparedFiles.push({
          filename: file.filename,
          buffer: Buffer.from(file.fileBase64, 'base64')
        });
      }
      
      if (preparedFiles.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No valid files provided. Supported formats: PDF, DOCX' },
          { status: 400 }
        );
      }
      
      // Analyze with automatic grouping
      const { groups, results } = await analyzeMultipleDocuments(
        preparedFiles,
        resolvedCompanyId,
        dryRun
      );
      
      // Summarize results
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      return NextResponse.json({
        success: successful.length > 0,
        mode: 'multi_file',
        summary: {
          total_files: preparedFiles.length,
          groups_created: groups.length,
          successful_analyses: successful.length,
          failed_analyses: failed.length
        },
        groups: groups.map(g => ({
          id: g.id,
          category: g.category,
          documents: g.documents.map(d => ({ 
            filename: d.filename, 
            category: d.category 
          })),
          primary_document: g.primaryDocument?.filename
        })),
        analyses: successful.map(r => ({
          analysis: r.analysis,
          analysisId: r.analysisId,
          snippets: r.snippets
        })),
        errors: failed.map(r => r.error),
        metadata: {
          companyId: resolvedCompanyId,
          dryRun,
          analyzedAt: new Date().toISOString()
        }
      });
    }
    
    // SINGLE FILE MODE
    // Validate input
    if (!storagePath && !fileBase64) {
      return NextResponse.json(
        { success: false, error: 'Either storagePath or fileBase64 is required (or provide files array for multi-file mode)' },
        { status: 400 }
      );
    }
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'filename is required' },
        { status: 400 }
      );
    }
    
    // Get file buffer
    let fileBuffer: Buffer;
    
    if (storagePath) {
      // Download from Supabase Storage
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('legal-docs')
        .download(storagePath);
        
      if (error || !data) {
        // Try financial-docs bucket as fallback
        const fallback = await supabase.storage
          .from('financial-docs')
          .download(storagePath);
          
        if (fallback.error || !fallback.data) {
          return NextResponse.json(
            { success: false, error: `Failed to download file: ${error?.message || 'Not found'}` },
            { status: 404 }
          );
        }
        
        fileBuffer = Buffer.from(await fallback.data.arrayBuffer());
      } else {
        fileBuffer = Buffer.from(await data.arrayBuffer());
      }
    } else {
      // Decode base64
      fileBuffer = Buffer.from(fileBase64, 'base64');
    }
    
    // Validate file type (now supports PDF and DOCX)
    const ext = filename.toLowerCase();
    console.log(`[Legal API] Processing file: ${filename}, extension check: ${ext}`);
    console.log(`[Legal API] File buffer size: ${fileBuffer.length}, is Buffer: ${Buffer.isBuffer(fileBuffer)}`);
    
    if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc')) {
      console.log(`[Legal API] Rejecting file due to extension: ${ext}`);
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Please upload PDF or Word document (.docx)' },
        { status: 400 }
      );
    }
    
    // Quick classification from filename
    const quickClassification = classifyFromFilename(filename);
    const documentCategory = classifyDocumentCategory(filename);
    console.log(`[Legal API] Quick classification for ${filename}:`, quickClassification, `Category: ${documentCategory}`);
    
    // Analyze the document
    console.log(`[Legal API] Starting analysis of ${filename} (dryRun: ${dryRun})`);
    
    const request: LegalAnalysisRequest = {
      fileBuffer,
      filename,
      companyId: resolvedCompanyId,
      companySlug,
      dryRun
    };
    
    const result = await analyzeLegalDocument(request);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      mode: 'single_file',
      analysis: result.analysis,
      analysisId: result.analysisId,
      snippets: result.snippets,
      quickClassification,
      documentCategory,
      metadata: {
        filename,
        companyId: resolvedCompanyId,
        dryRun,
        analyzedAt: new Date().toISOString()
      }
    });
    
  } catch (error: any) {
    console.error('[Legal API] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Analysis failed',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET: Retrieve past analyses
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const analysisId = searchParams.get('id');
    const companyId = searchParams.get('companyId');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const supabase = getSupabase();
    
    if (analysisId) {
      // Get specific analysis with term sources
      const { data: analysis, error } = await supabase
        .from('legal_analyses')
        .select(`
          *,
          term_sources:legal_term_sources(*)
        `)
        .eq('id', analysisId)
        .single();
        
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ success: true, analysis });
    }
    
    // List analyses
    let query = supabase
      .from('legal_analyses')
      .select('id, document_name, document_type, jurisdiction, executive_summary, flags, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    
    const { data: analyses, error } = await query;
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, analyses });
    
  } catch (error: any) {
    console.error('[Legal API GET] Error:', error);
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


