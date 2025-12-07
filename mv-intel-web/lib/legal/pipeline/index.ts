/**
 * Legal Document Analysis Pipeline
 * 
 * 3-Phase Architecture:
 * - Phase 1: Individual document extraction (parallel, fast)
 * - Phase 2: Category-based deep analysis (sequential by category)
 * - Phase 3: Deal synthesis (single unified view)
 */

export * from './types';
export { processPhase1Document, processPhase1Batch, groupByCategory } from './phase1';
export { processPhase2Category, processPhase2All } from './phase2';
export { processPhase3Synthesis } from './phase3';

import { 
  PipelineState, 
  PipelineStartRequest,
  Phase1Input,
  DocumentCategory
} from './types';
import { processPhase1Batch, groupByCategory } from './phase1';
import { processPhase2All } from './phase2';
import { processPhase3Synthesis } from './phase3';

// =============================================================================
// PIPELINE ORCHESTRATOR
// =============================================================================

export interface PipelineCallbacks {
  onProgress?: (state: PipelineState) => void;
  onPhase1Progress?: (completed: number, total: number, current: string) => void;
  onPhase2Progress?: (category: DocumentCategory, status: string) => void;
  onPhase3Progress?: (status: string) => void;
  onComplete?: (state: PipelineState) => void;
  onError?: (error: Error, state: PipelineState) => void;
}

export async function runLegalAnalysisPipeline(
  request: PipelineStartRequest,
  callbacks?: PipelineCallbacks
): Promise<PipelineState> {
  const startTime = Date.now();
  const pipelineId = crypto.randomUUID();
  
  // Initialize state
  const state: PipelineState = {
    id: pipelineId,
    status: 'initializing',
    progress: {
      phase1: { total: request.files.length, completed: 0, failed: 0 },
      phase2: { total: 4, completed: 0, failed: 0 }, // 4 categories
      phase3: { started: false, completed: false }
    },
    phase1Results: [],
    phase2Results: [],
    startedAt: new Date().toISOString(),
    config: {
      dryRun: request.dryRun || false,
      companyId: request.companyId,
      companyName: request.companyName
    }
  };
  
  callbacks?.onProgress?.(state);
  
  try {
    // ==========================================================================
    // PHASE 1: Individual Document Extraction
    // ==========================================================================
    console.log(`[Pipeline] Starting Phase 1: ${request.files.length} documents`);
    state.status = 'phase1';
    callbacks?.onProgress?.(state);
    
    // Prepare inputs
    const phase1Inputs: Phase1Input[] = request.files.map(f => ({
      filename: f.filename,
      buffer: Buffer.from(f.fileBase64, 'base64'),
      fileType: f.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx'
    }));
    
    // Process in parallel with controlled concurrency
    state.phase1Results = await processPhase1Batch(
      phase1Inputs,
      (completed, total, current) => {
        state.progress.phase1.completed = completed;
        state.progress.phase1.current = current;
        state.progress.phase1.failed = state.phase1Results.filter(r => r.status === 'error').length;
        callbacks?.onPhase1Progress?.(completed, total, current);
        callbacks?.onProgress?.(state);
      },
      3 // Concurrency of 3
    );
    
    const phase1Successful = state.phase1Results.filter(r => r.status === 'complete').length;
    console.log(`[Pipeline] Phase 1 complete: ${phase1Successful}/${request.files.length} successful`);
    
    // ==========================================================================
    // PHASE 2: Category-Based Deep Analysis
    // ==========================================================================
    console.log('[Pipeline] Starting Phase 2: Category analysis');
    state.status = 'phase2';
    callbacks?.onProgress?.(state);
    
    state.phase2Results = await processPhase2All(
      state.phase1Results,
      (category, status) => {
        state.progress.phase2.currentCategory = category;
        if (status === 'complete') {
          state.progress.phase2.completed++;
        }
        callbacks?.onPhase2Progress?.(category, status);
        callbacks?.onProgress?.(state);
      }
    );
    
    const phase2Successful = state.phase2Results.filter(r => r.status === 'complete').length;
    console.log(`[Pipeline] Phase 2 complete: ${phase2Successful}/4 categories analyzed`);
    
    // ==========================================================================
    // PHASE 3: Deal Synthesis
    // ==========================================================================
    console.log('[Pipeline] Starting Phase 3: Synthesis');
    state.status = 'phase3';
    state.progress.phase3.started = true;
    callbacks?.onProgress?.(state);
    
    state.phase3Result = await processPhase3Synthesis(
      {
        phase1Results: state.phase1Results,
        phase2Results: state.phase2Results,
        companyName: request.companyName
      },
      (status) => {
        callbacks?.onPhase3Progress?.(status);
        callbacks?.onProgress?.(state);
      }
    );
    
    state.progress.phase3.completed = state.phase3Result.status === 'complete';
    console.log(`[Pipeline] Phase 3 complete`);
    
    // ==========================================================================
    // COMPLETE
    // ==========================================================================
    state.status = 'complete';
    state.completedAt = new Date().toISOString();
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Pipeline] Complete in ${totalDuration}ms`);
    
    callbacks?.onProgress?.(state);
    callbacks?.onComplete?.(state);
    
    return state;
    
  } catch (error: any) {
    console.error('[Pipeline] Error:', error.message);
    
    state.status = 'error';
    state.error = error.message;
    state.completedAt = new Date().toISOString();
    
    callbacks?.onError?.(error, state);
    callbacks?.onProgress?.(state);
    
    return state;
  }
}

// =============================================================================
// HELPER: Get Summary for Display
// =============================================================================

export function getPipelineSummary(state: PipelineState) {
  return {
    id: state.id,
    status: state.status,
    progress: {
      phase1: `${state.progress.phase1.completed}/${state.progress.phase1.total}`,
      phase2: `${state.progress.phase2.completed}/4 categories`,
      phase3: state.progress.phase3.completed ? 'Complete' : state.progress.phase3.started ? 'In Progress' : 'Pending'
    },
    documentsAnalyzed: state.phase1Results.filter(r => r.status === 'complete').length,
    executiveSummary: state.phase3Result?.executiveSummary || [],
    flags: state.phase3Result?.flagSummary,
    duration: state.completedAt 
      ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
      : Date.now() - new Date(state.startedAt).getTime()
  };
}

