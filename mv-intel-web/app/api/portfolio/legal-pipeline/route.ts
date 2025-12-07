/**
 * Legal Document Analysis Pipeline API
 * 
 * POST /api/portfolio/legal-pipeline
 * 
 * New 3-phase pipeline architecture:
 * - Phase 1: Individual extraction (parallel)
 * - Phase 2: Category analysis (sequential)
 * - Phase 3: Deal synthesis
 * 
 * Supports Server-Sent Events for real-time progress updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  runLegalAnalysisPipeline, 
  getPipelineSummary,
  PipelineState 
} from '@/lib/legal/pipeline';
import { generateAndStoreSnippets } from '@/lib/legal/snippets/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(url, key);
}

// =============================================================================
// STREAMING RESPONSE HELPER
// =============================================================================

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    }
  });
  
  const send = (event: string, data: any) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  };
  
  const close = () => {
    controller.close();
  };
  
  return { stream, send, close };
}

// =============================================================================
// POST: Run Pipeline with Streaming Progress
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
      files,
      companyId, 
      companyName,
      dryRun = false,
      stream = false  // If true, return SSE stream
    } = body;
    
    // Validate input
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided. Expected array of {filename, fileBase64}' },
        { status: 400 }
      );
    }
    
    // Validate file formats
    const validFiles = files.filter((f: any) => {
      if (!f.filename || !f.fileBase64) return false;
      const ext = f.filename.toLowerCase();
      return ext.endsWith('.pdf') || ext.endsWith('.docx') || ext.endsWith('.doc');
    });
    
    if (validFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid files. Supported: PDF, DOCX, DOC' },
        { status: 400 }
      );
    }
    
    console.log(`[Legal Pipeline API] Starting analysis of ${validFiles.length} files`);
    
    // ==========================================================================
    // STREAMING MODE
    // ==========================================================================
    if (stream) {
      const { stream: sseStream, send, close } = createSSEStream();
      
      // Run pipeline in background, sending progress updates
      (async () => {
        try {
          const finalState = await runLegalAnalysisPipeline(
            {
              files: validFiles,
              companyId,
              companyName,
              dryRun
            },
            {
              onProgress: (state) => {
                send('progress', getPipelineSummary(state));
              },
              onPhase1Progress: (completed, total, current) => {
                send('phase1', { completed, total, current });
              },
              onPhase2Progress: (category, status) => {
                send('phase2', { category, status });
              },
              onPhase3Progress: (status) => {
                send('phase3', { status });
              },
              onComplete: async (state) => {
                let analysisId: string | undefined;
                
                // Save to database if not dry run
                if (!dryRun && state.phase3Result) {
                  analysisId = await savePipelineResults(state, companyId);
                  
                  // Generate Snippets
                  if (analysisId) {
                    send('snippets_start', { count: 0 });
                    await generateAndStoreSnippets({
                      pipelineId: state.id,
                      analysisId,
                      documents: validFiles.map(f => {
                        const result = state.phase1Results.find(r => r.filename === f.filename);
                        return {
                          filename: f.filename,
                          buffer: Buffer.from(f.fileBase64, 'base64'),
                          fileType: f.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
                          results: result!
                        };
                      })
                    }, (count, total) => {
                      send('snippets_progress', { count, total });
                    });
                  }
                }
                
                send('complete', {
                  success: true,
                  summary: getPipelineSummary(state),
                  result: state.phase3Result,
                  analysisId
                });
                close();
              },
              onError: (error, state) => {
                send('error', { 
                  error: error.message,
                  summary: getPipelineSummary(state)
                });
                close();
              }
            }
          );
        } catch (err: any) {
          send('error', { error: err.message });
          close();
        }
      })();
      
      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    
    // ==========================================================================
    // NON-STREAMING MODE (wait for complete result)
    // ==========================================================================
    const finalState = await runLegalAnalysisPipeline(
      {
        files: validFiles,
        companyId,
        companyName,
        dryRun
      }
    );
    
    // Save to database if not dry run
    let savedAnalysisId: string | undefined;
    if (!dryRun && finalState.phase3Result && finalState.status === 'complete') {
      savedAnalysisId = await savePipelineResults(finalState, companyId);
      
      // Generate Snippets (fire and forget for non-streaming? or wait?)
      // Let's wait to ensure they are available
      if (savedAnalysisId) {
        console.log('[Legal Pipeline API] Generating snippets...');
        await generateAndStoreSnippets({
          pipelineId: finalState.id,
          analysisId: savedAnalysisId,
          documents: validFiles.map(f => {
            const result = finalState.phase1Results.find(r => r.filename === f.filename);
            return {
              filename: f.filename,
              buffer: Buffer.from(f.fileBase64, 'base64'),
              fileType: f.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
              results: result!
            };
          })
        });
      }
    }
    
    return NextResponse.json({
      success: finalState.status === 'complete',
      pipelineId: finalState.id,
      summary: getPipelineSummary(finalState),
      
      // Phase results
      phase1: {
        completed: finalState.progress.phase1.completed,
        total: finalState.progress.phase1.total,
        failed: finalState.progress.phase1.failed,
        results: finalState.phase1Results.map(r => ({
          filename: r.filename,
          status: r.status,
          documentType: r.documentType,
          category: r.category,
          jurisdiction: r.jurisdiction,
          keyTerms: r.keyTerms,
          flags: r.quickFlags,
          durationMs: r.durationMs
        }))
      },
      
      phase2: {
        completed: finalState.progress.phase2.completed,
        results: finalState.phase2Results.map(r => ({
          category: r.category,
          status: r.status,
          summary: r.summary,
          flag: r.categoryFlag,
          documents: r.sourceDocuments,
          durationMs: r.durationMs
        }))
      },
      
      phase3: finalState.phase3Result ? {
        status: finalState.phase3Result.status,
        executiveSummary: finalState.phase3Result.executiveSummary,
        transactionSnapshot: finalState.phase3Result.transactionSnapshot,
        crossDocumentIssues: finalState.phase3Result.crossDocumentIssues,
        flagSummary: finalState.phase3Result.flagSummary,
        jurisdiction: finalState.phase3Result.jurisdiction,
        instrumentType: finalState.phase3Result.instrumentType
      } : null,
      
      // Metadata
      metadata: {
        analysisId: savedAnalysisId,
        companyId,
        dryRun,
        totalDurationMs: finalState.completedAt 
          ? new Date(finalState.completedAt).getTime() - new Date(finalState.startedAt).getTime()
          : undefined,
        analyzedAt: finalState.completedAt
      }
    });
    
  } catch (error: any) {
    console.error('[Legal Pipeline API] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Pipeline failed',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// SAVE RESULTS TO DATABASE
// =============================================================================

async function savePipelineResults(
  state: PipelineState, 
  companyId?: string
): Promise<string | undefined> {
  if (!state.phase3Result) return undefined;
  
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('legal_analyses')
      .insert({
        company_id: companyId || null,
        document_name: state.phase1Results.map(r => r.filename).join(', '),
        document_type: state.phase3Result.instrumentType || 'OTHER',
        jurisdiction: state.phase3Result.jurisdiction || 'Unknown',
        analysis: {
          pipeline_id: state.id,
          phase1: state.phase1Results,
          phase2: state.phase2Results,
          phase3: state.phase3Result
        },
        executive_summary: state.phase3Result.executiveSummary,
        flags: state.phase3Result.flagSummary
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[Legal Pipeline] Failed to save:', error);
      return undefined;
    }
    
    console.log(`[Legal Pipeline] Saved analysis: ${data.id}`);
    return data.id;
    
  } catch (err: any) {
    console.error('[Legal Pipeline] Save error:', err.message);
    return undefined;
  }
}

// =============================================================================
// GET: Retrieve Pipeline Results
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const analysisId = searchParams.get('id');
    const companyId = searchParams.get('companyId');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const supabase = getSupabase();
    
    if (analysisId) {
      // Fetch analysis + snippets
      const { data: analysis, error } = await supabase
        .from('legal_analyses')
        .select('*')
        .eq('id', analysisId)
        .single();
      
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
      
      // Fetch snippets
      const { data: snippets } = await supabase
        .from('legal_term_sources')
        .select('*')
        .eq('analysis_id', analysisId);
        
      // Merge snippets into key terms for easy display
      if (snippets && analysis.analysis?.phase1) {
        analysis.analysis.phase1.forEach((doc: any) => {
          if (doc.keyTerms) {
            Object.keys(doc.keyTerms).forEach(key => {
              const snippet = snippets.find(s => s.term_key === key && s.page_number === doc.keyTerms[key]?.page_number);
              if (snippet) {
                doc.keyTerms[key].snippet_url = snippet.snippet_url;
              }
            });
          }
        });
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
    
    const { data, error } = await query;
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, analyses: data });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
