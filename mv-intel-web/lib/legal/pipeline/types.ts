/**
 * Legal Document Analysis Pipeline Types
 * 
 * 3-Phase Pipeline Architecture:
 * - Phase 1: Individual document extraction (parallel)
 * - Phase 2: Category-based deep analysis (sequential by category)
 * - Phase 3: Deal synthesis (single call)
 */

// =============================================================================
// DOCUMENT CATEGORIES
// =============================================================================

export type DocumentCategory = 
  | 'economics'      // SPA, Term Sheet, SAFE, Convertible Note
  | 'governance'     // SHA, Voting Agreement, IRA, Articles/Charter
  | 'legal_gc'       // Indemnification, Disclosure Schedules
  | 'standalone';    // Management Rights Letters, ROFR/Co-Sale

export type DocumentSubtype = 
  | 'term_sheet'
  | 'spa_stock_purchase'
  | 'sha_shareholders_agreement'
  | 'ira_investor_rights'
  | 'voting_agreement'
  | 'articles_charter'
  | 'safe'
  | 'convertible_note'
  | 'cla'
  | 'side_letter'
  | 'indemnification'
  | 'disclosure_schedule'
  | 'management_rights'
  | 'rofr_cosale'
  | 'other';

// =============================================================================
// PHASE 1: INDIVIDUAL EXTRACTION
// =============================================================================

export interface Phase1Input {
  filename: string;
  buffer: Buffer;
  fileType: 'pdf' | 'docx';
}

export interface Phase1Result {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  
  // Extracted metadata
  documentType?: DocumentSubtype;
  category?: DocumentCategory;
  jurisdiction?: 'US' | 'UK' | 'Continental Europe' | 'Unknown';
  
  // Quick extraction results
  keyTerms?: {
    parties?: string[];
    roundType?: string;
    valuationCap?: number;
    discount?: number;
    liquidationPreference?: string;
    antiDilution?: string;
    boardSeats?: string;
    protectiveProvisions?: string[];
  };
  
  // Flags from quick scan
  quickFlags?: {
    hasUnusualTerms: boolean;
    flaggedItems: string[];
  };
  
  // Raw text for later phases
  extractedText?: string;
  wordCount?: number;
  
  // Timing
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// =============================================================================
// PHASE 2: CATEGORY ANALYSIS
// =============================================================================

export interface Phase2Input {
  category: DocumentCategory;
  documents: Phase1Result[];
}

export interface Phase2Result {
  category: DocumentCategory;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  
  // Category-specific deep analysis
  analysis?: {
    // Economics category
    economics?: {
      liquidationPreference?: {
        multiple: number;
        type: 'participating' | 'non_participating' | 'capped_participating';
        seniority: string;
        rationale: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      antiDilution?: {
        type: 'broad_weighted_average' | 'narrow_weighted_average' | 'full_ratchet' | 'none';
        triggers: string[];
        exclusions: string[];
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      dividends?: {
        rate: string;
        cumulative: boolean;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      redemption?: {
        available: boolean;
        terms: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      payToPlay?: {
        exists: boolean;
        consequences: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
    };
    
    // Governance category
    governance?: {
      board?: {
        size: number;
        investorSeats: number;
        founderSeats: number;
        independentSeats: number;
        ourSeat: boolean;
        observerRights: boolean;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      protectiveProvisions?: {
        matters: string[];
        consentRequired: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      voting?: {
        thresholds: Record<string, string>;
        classVoting: boolean;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      dragAlong?: {
        triggers: string;
        thresholds: string;
        minimumPrice: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      tagAlong?: {
        available: boolean;
        terms: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
    };
    
    // Legal/GC category
    legalGC?: {
      repsWarranties?: {
        scope: string;
        caps: string;
        survivalPeriod: string;
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      indemnification?: {
        scope: string;
        caps: string;
        carveouts: string[];
        flag: 'GREEN' | 'AMBER' | 'RED';
      };
      governingLaw?: string;
      disputeResolution?: string;
      confidentiality?: string;
      flag: 'GREEN' | 'AMBER' | 'RED';
    };
  };
  
  // Category summary
  summary?: string[];
  categoryFlag?: 'GREEN' | 'AMBER' | 'RED';
  
  // Source documents
  sourceDocuments: string[];
  
  // Timing
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// =============================================================================
// PHASE 3: DEAL SYNTHESIS
// =============================================================================

export interface Phase3Input {
  phase1Results: Phase1Result[];
  phase2Results: Phase2Result[];
  companyName?: string;
}

export interface Phase3Result {
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  
  // Executive Summary
  executiveSummary: {
    point: string;
    flag: 'GREEN' | 'AMBER' | 'RED';
    category: 'economics' | 'governance' | 'legal' | 'general';
  }[];
  
  // Transaction Snapshot
  transactionSnapshot?: {
    roundType: string;
    security: string;
    preMoneyValuation?: number;
    postMoneyValuation?: number;
    roundSize?: number;
    pricePerShare?: number;
    optionPool?: {
      size: number;
      preMoney: boolean;
    };
  };
  
  // Cross-document issues
  crossDocumentIssues?: {
    conflicts: {
      issue: string;
      documents: string[];
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
    }[];
    missingDocuments: string[];
    inconsistencies: string[];
  };
  
  // Final Flags
  flagSummary: {
    economics: { flag: 'GREEN' | 'AMBER' | 'RED'; justification: string };
    governance: { flag: 'GREEN' | 'AMBER' | 'RED'; justification: string };
    dilution: { flag: 'GREEN' | 'AMBER' | 'RED'; justification: string };
    investorRights: { flag: 'GREEN' | 'AMBER' | 'RED'; justification: string };
    legalRisk: { flag: 'GREEN' | 'AMBER' | 'RED'; justification: string };
  };
  
  // Metadata
  jurisdiction: string;
  instrumentType: string;
  analyzedDocuments: string[];
  
  // Timing
  startedAt?: string;
  completedAt?: string;
  totalDurationMs?: number;
}

// =============================================================================
// PIPELINE STATE
// =============================================================================

export interface PipelineState {
  id: string;
  status: 'initializing' | 'phase1' | 'phase2' | 'phase3' | 'complete' | 'error';
  error?: string;
  
  // Progress tracking
  progress: {
    phase1: {
      total: number;
      completed: number;
      failed: number;
      current?: string;
    };
    phase2: {
      total: number;
      completed: number;
      failed: number;
      currentCategory?: DocumentCategory;
    };
    phase3: {
      started: boolean;
      completed: boolean;
    };
  };
  
  // Results
  phase1Results: Phase1Result[];
  phase2Results: Phase2Result[];
  phase3Result?: Phase3Result;
  
  // Timing
  startedAt: string;
  completedAt?: string;
  
  // Config
  config: {
    dryRun: boolean;
    companyId?: string;
    companyName?: string;
  };
}

// =============================================================================
// API TYPES
// =============================================================================

export interface PipelineStartRequest {
  files: {
    filename: string;
    fileBase64: string;
  }[];
  companyId?: string;
  companyName?: string;
  dryRun?: boolean;
}

export interface PipelineProgressEvent {
  type: 'progress' | 'phase1_complete' | 'phase2_complete' | 'complete' | 'error';
  pipelineId: string;
  state: PipelineState;
  timestamp: string;
}

