/**
 * Phase 2: Category-Based Deep Analysis
 * 
 * Processes documents grouped by category for deep analysis:
 * - Economics: SPA, Term Sheet, SAFE, Notes
 * - Governance: SHA, Voting Agreement, IRA, Articles
 * - Legal/GC: Indemnification, Side Letters, Disclosure
 * - Standalone: Management Rights, ROFR/Co-Sale
 */

import OpenAI from 'openai';
import { getLegalConfig } from '../config';
import { 
  Phase1Result, 
  Phase2Input, 
  Phase2Result, 
  DocumentCategory 
} from './types';

// =============================================================================
// OPENAI CLIENT
// =============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// =============================================================================
// CATEGORY-SPECIFIC PROMPTS
// =============================================================================

// Default prompts (used as fallback if not in legal_config)
export const DEFAULT_ECONOMICS_PROMPT = `You are a VC lawyer analyzing ECONOMICS-related documents from an investment deal.

Analyze the provided documents and extract detailed economics terms. Return JSON:

{
  "liquidation_preference": {
    "multiple": 1.0,
    "type": "participating" | "non_participating" | "capped_participating",
    "cap": number or null,
    "seniority": "senior to all" | "pari passu with Series X" | "junior",
    "participation_details": "description",
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "anti_dilution": {
    "type": "broad_weighted_average" | "narrow_weighted_average" | "full_ratchet" | "none",
    "triggers": ["list of triggering events"],
    "exclusions": ["ESOP", "strategic issuances", etc.],
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "dividends": {
    "rate": "8% cumulative" or "none",
    "cumulative": true/false,
    "pik_allowed": true/false,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "redemption": {
    "available": true/false,
    "trigger_date": "5 years from closing" or null,
    "price": "original purchase price plus accrued dividends",
    "mandatory_vs_optional": "mandatory" | "optional" | "none",
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "pay_to_play": {
    "exists": true/false,
    "consequences": "conversion to common" | "loss of anti-dilution" | null,
    "threshold": "pro rata" or specific amount,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "conversion": {
    "automatic_triggers": ["qualified IPO at $X", etc.],
    "optional": true/false,
    "ratio": "1:1 subject to adjustments",
    "flag": "GREEN" | "AMBER" | "RED"
  },
  "summary": ["bullet 1", "bullet 2", "..."],
  "overall_flag": "GREEN" | "AMBER" | "RED",
  "overall_rationale": "summary assessment"
}

Use GREEN for market-standard terms, AMBER for slightly aggressive but acceptable, RED for unusual/concerning.`;

export const DEFAULT_GOVERNANCE_PROMPT = `You are a VC lawyer analyzing GOVERNANCE-related documents from an investment deal.

Analyze the provided documents and extract detailed governance terms. Return JSON:

{
  "board": {
    "size": 5,
    "composition": {
      "investor_seats": 2,
      "founder_seats": 2,
      "independent_seats": 1,
      "appointment_rights": {"Investor A": 1, "Founders": 2, "Mutual": 1}
    },
    "our_seat": true/false,
    "our_observer_rights": true/false,
    "board_matters_requiring_consent": ["list"],
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "protective_provisions": {
    "investor_consent_matters": [
      {"matter": "amendment to charter", "threshold": "majority preferred"},
      {"matter": "new debt over $X", "threshold": "majority preferred"}
    ],
    "our_blocking_rights": true/false,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "voting": {
    "ordinary_resolution": "50%+",
    "special_resolution": "75%",
    "class_voting": true/false,
    "written_consent_allowed": true/false,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "drag_along": {
    "trigger_threshold": "majority of preferred + majority of common",
    "minimum_price": "greater of 3x or $X per share",
    "investor_protections": ["list of protections"],
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "tag_along": {
    "available": true/false,
    "triggers": "founder sale of >X%",
    "pro_rata_participation": true/false,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "information_rights": {
    "annual_audited": true/false,
    "quarterly_unaudited": true/false,
    "monthly_reports": true/false,
    "budget_approval": true/false,
    "inspection_rights": true/false,
    "threshold": "Major Investor = $X",
    "flag": "GREEN" | "AMBER" | "RED"
  },
  "summary": ["bullet 1", "bullet 2", "..."],
  "overall_flag": "GREEN" | "AMBER" | "RED",
  "overall_rationale": "summary assessment"
}`;

export const DEFAULT_LEGAL_GC_PROMPT = `You are a General Counsel analyzing LEGAL-related documents from an investment deal.

Analyze the provided documents for legal risks and compliance. Return JSON:

{
  "reps_warranties": {
    "company_reps_scope": "standard" | "extensive" | "limited",
    "founder_reps": true/false,
    "survival_period": "18 months" or "until next financing",
    "caps": "1x investment amount" or "uncapped",
    "baskets": "$X before claims",
    "sandbagging": "pro-sandbagging" | "anti-sandbagging" | "silent",
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "indemnification": {
    "scope": "broad" | "standard" | "narrow",
    "d_and_o_coverage": true/false,
    "advancement_of_expenses": true/false,
    "caps": "description",
    "carveouts": ["fraud", "willful misconduct"],
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "governing_law": {
    "jurisdiction": "Delaware" | "England" | "other",
    "dispute_mechanism": "courts" | "arbitration",
    "arbitration_rules": "JAMS" | "AAA" | "ICC" | null,
    "flag": "GREEN" | "AMBER" | "RED"
  },
  "ip_matters": {
    "ip_assignment_confirmed": true/false,
    "founder_ip_reps": true/false,
    "invention_assignment": true/false,
    "flag": "GREEN" | "AMBER" | "RED",
    "rationale": "why this flag"
  },
  "key_person": {
    "key_persons_identified": ["names"],
    "non_compete": true/false,
    "non_solicit": true/false,
    "confidentiality": true/false,
    "flag": "GREEN" | "AMBER" | "RED"
  },
  "regulatory": {
    "compliance_reps": true/false,
    "specific_regulations": ["list if any"],
    "sanctions_aml": true/false,
    "flag": "GREEN" | "AMBER" | "RED"
  },
  "gc_focus_points": ["point 1", "point 2", "..."],
  "comfort_points": ["standard terms", "..."],
  "overall_flag": "GREEN" | "AMBER" | "RED",
  "overall_rationale": "summary assessment"
}`;

export const DEFAULT_STANDALONE_PROMPT = `You are a VC lawyer analyzing standalone documents from an investment deal.

These documents don't fit main categories but may contain important terms. Return JSON:

{
  "document_purpose": "brief description of what this document does",
  "key_provisions": [
    {"provision": "name", "description": "what it does", "flag": "GREEN" | "AMBER" | "RED"}
  ],
  "cross_references": ["references to other deal documents"],
  "unusual_terms": ["anything non-standard"],
  "summary": ["bullet 1", "bullet 2"],
  "overall_flag": "GREEN" | "AMBER" | "RED",
  "overall_rationale": "assessment"
}`;

// =============================================================================
// PHASE 2 PROCESSOR
// =============================================================================

export async function processPhase2Category(
  input: Phase2Input,
  onProgress?: (status: string) => void
): Promise<Phase2Result> {
  const startTime = Date.now();
  
  const result: Phase2Result = {
    category: input.category,
    status: 'processing',
    sourceDocuments: input.documents.map(d => d.filename),
    startedAt: new Date().toISOString()
  };
  
  // Skip if no documents in this category
  if (input.documents.length === 0) {
    result.status = 'complete';
    result.summary = ['No documents in this category'];
    result.categoryFlag = 'GREEN';
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startTime;
    return result;
  }
  
  try {
    onProgress?.(`Analyzing ${input.category} documents...`);
    
    // Build combined document context
    const documentContext = input.documents
      .filter(d => d.status === 'complete' && d.extractedText)
      .map(d => {
        // Truncate each doc to prevent token overflow
        const maxChars = Math.floor(20000 / input.documents.length);
        const text = d.extractedText!.length > maxChars 
          ? d.extractedText!.substring(0, maxChars) + '\n[... truncated ...]'
          : d.extractedText;
        
        return `
=== DOCUMENT: ${d.filename} ===
Type: ${d.documentType}
Jurisdiction: ${d.jurisdiction}
${d.keyTerms ? `Quick Scan: ${JSON.stringify(d.keyTerms)}` : ''}

CONTENT:
${text}
`;
      })
      .join('\n\n---\n\n');
    
    // Select prompt based on category
    let systemPrompt: string;
    switch (input.category) {
      case 'economics':
        systemPrompt = await getLegalConfig('economics_prompt') || DEFAULT_ECONOMICS_PROMPT;
        break;
      case 'governance':
        systemPrompt = await getLegalConfig('governance_prompt') || DEFAULT_GOVERNANCE_PROMPT;
        break;
      case 'legal_gc':
        systemPrompt = await getLegalConfig('legal_gc_prompt') || DEFAULT_LEGAL_GC_PROMPT;
        break;
      default:
        systemPrompt = await getLegalConfig('standalone_prompt') || DEFAULT_STANDALONE_PROMPT;
    }
    
    // Call GPT-4o for deep analysis
    const openai = getOpenAI();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use full GPT-4o for Phase 2 deep analysis
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: `Analyze these ${input.category.toUpperCase()} documents from an investment deal and extract detailed terms as specified.\n\n${documentContext}\n\nReturn comprehensive JSON analysis.`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        
        // Map parsed results to our structure based on category
        result.analysis = {};
        
        if (input.category === 'economics') {
          result.analysis.economics = {
            liquidationPreference: parsed.liquidation_preference ? {
              multiple: parsed.liquidation_preference.multiple || 1,
              type: parsed.liquidation_preference.type || 'non_participating',
              seniority: parsed.liquidation_preference.seniority || 'unknown',
              rationale: parsed.liquidation_preference.rationale || '',
              flag: parsed.liquidation_preference.flag || 'AMBER'
            } : undefined,
            antiDilution: parsed.anti_dilution ? {
              type: parsed.anti_dilution.type || 'none',
              triggers: parsed.anti_dilution.triggers || [],
              exclusions: parsed.anti_dilution.exclusions || [],
              flag: parsed.anti_dilution.flag || 'AMBER'
            } : undefined,
            dividends: parsed.dividends ? {
              rate: parsed.dividends.rate || 'none',
              cumulative: parsed.dividends.cumulative || false,
              flag: parsed.dividends.flag || 'GREEN'
            } : undefined,
            redemption: parsed.redemption ? {
              available: parsed.redemption.available || false,
              terms: parsed.redemption.price || '',
              flag: parsed.redemption.flag || 'GREEN'
            } : undefined,
            payToPlay: parsed.pay_to_play ? {
              exists: parsed.pay_to_play.exists || false,
              consequences: parsed.pay_to_play.consequences || '',
              flag: parsed.pay_to_play.flag || 'GREEN'
            } : undefined
          };
        } else if (input.category === 'governance') {
          result.analysis.governance = {
            board: parsed.board ? {
              size: parsed.board.size || 0,
              investorSeats: parsed.board.composition?.investor_seats || 0,
              founderSeats: parsed.board.composition?.founder_seats || 0,
              independentSeats: parsed.board.composition?.independent_seats || 0,
              ourSeat: parsed.board.our_seat || false,
              observerRights: parsed.board.our_observer_rights || false,
              flag: parsed.board.flag || 'AMBER'
            } : undefined,
            protectiveProvisions: parsed.protective_provisions ? {
              matters: parsed.protective_provisions.investor_consent_matters?.map((m: any) => m.matter) || [],
              consentRequired: 'majority preferred',
              flag: parsed.protective_provisions.flag || 'AMBER'
            } : undefined,
            voting: parsed.voting ? {
              thresholds: {
                ordinary: parsed.voting.ordinary_resolution || '50%',
                special: parsed.voting.special_resolution || '75%'
              },
              classVoting: parsed.voting.class_voting || false,
              flag: parsed.voting.flag || 'GREEN'
            } : undefined,
            dragAlong: parsed.drag_along ? {
              triggers: parsed.drag_along.trigger_threshold || '',
              thresholds: parsed.drag_along.trigger_threshold || '',
              minimumPrice: parsed.drag_along.minimum_price || '',
              flag: parsed.drag_along.flag || 'AMBER'
            } : undefined,
            tagAlong: parsed.tag_along ? {
              available: parsed.tag_along.available || false,
              terms: parsed.tag_along.triggers || '',
              flag: parsed.tag_along.flag || 'GREEN'
            } : undefined
          };
        } else if (input.category === 'legal_gc') {
          result.analysis.legalGC = {
            repsWarranties: parsed.reps_warranties ? {
              scope: parsed.reps_warranties.company_reps_scope || 'standard',
              caps: parsed.reps_warranties.caps || '',
              survivalPeriod: parsed.reps_warranties.survival_period || '',
              flag: parsed.reps_warranties.flag || 'AMBER'
            } : undefined,
            indemnification: parsed.indemnification ? {
              scope: parsed.indemnification.scope || 'standard',
              caps: parsed.indemnification.caps || '',
              carveouts: parsed.indemnification.carveouts || [],
              flag: parsed.indemnification.flag || 'AMBER'
            } : undefined,
            governingLaw: parsed.governing_law?.jurisdiction || 'Unknown',
            disputeResolution: parsed.governing_law?.dispute_mechanism || 'Unknown',
            flag: parsed.overall_flag || 'AMBER'
          };
        }
        
        result.summary = parsed.summary || parsed.gc_focus_points || [];
        result.categoryFlag = parsed.overall_flag || 'AMBER';
        
      } catch (parseError) {
        console.warn(`[Phase2] Failed to parse GPT response for ${input.category}`);
        result.summary = ['Analysis completed but response parsing failed'];
        result.categoryFlag = 'AMBER';
      }
    }
    
    result.status = 'complete';
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startTime;
    
    console.log(`[Phase2] Completed ${input.category} analysis (${input.documents.length} docs) in ${result.durationMs}ms`);
    
    return result;
    
  } catch (error: any) {
    console.error(`[Phase2] Error analyzing ${input.category}:`, error.message);
    
    result.status = 'error';
    result.error = error.message;
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startTime;
    
    return result;
  }
}

// =============================================================================
// BATCH PROCESSOR
// =============================================================================

export async function processPhase2All(
  phase1Results: Phase1Result[],
  onProgress?: (category: DocumentCategory, status: string) => void
): Promise<Phase2Result[]> {
  // Group documents by category
  const categories: DocumentCategory[] = ['economics', 'governance', 'legal_gc', 'standalone'];
  const results: Phase2Result[] = [];
  
  // Build category groups
  const groups: Record<DocumentCategory, Phase1Result[]> = {
    economics: [],
    governance: [],
    legal_gc: [],
    standalone: []
  };
  
  for (const doc of phase1Results) {
    if (doc.status === 'complete') {
      const category = doc.category || 'standalone';
      groups[category].push(doc);
    }
  }
  
  // Process each category sequentially
  for (const category of categories) {
    onProgress?.(category, 'starting');
    
    const result = await processPhase2Category(
      { category, documents: groups[category] },
      (status) => onProgress?.(category, status)
    );
    
    results.push(result);
    onProgress?.(category, 'complete');
  }
  
  return results;
}

