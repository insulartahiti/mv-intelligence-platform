/**
 * Phase 3: Deal Synthesis
 * 
 * Combines all category analyses into a unified deal view:
 * - Executive Summary with flags
 * - Transaction Snapshot
 * - Cross-document conflict detection
 * - Final assessment
 */

import OpenAI from 'openai';
import { 
  Phase1Result, 
  Phase2Result, 
  Phase3Input, 
  Phase3Result 
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
// SYNTHESIS PROMPT
// =============================================================================

const SYNTHESIS_PROMPT = `You are a senior VC investment professional synthesizing a complete legal due diligence analysis.

You have been provided with:
1. Individual document classifications and key terms (with source quotes)
2. Deep category-specific analyses (Economics, Governance, Legal/GC)

CRITICAL RULES:
1. ONLY include values that have source quotes from the underlying documents
2. If a value was not found in the documents, use null - DO NOT fabricate numbers
3. For transaction_snapshot, only include values explicitly stated in documents
4. If pre_money_valuation or round_size are not explicitly stated, set them to null
5. Include source_documents for each major finding

Your task is to produce a unified deal assessment. Return JSON:

{
  "executive_summary": [
    {"point": "Economics: 1x non-participating, pari passu - market standard", "flag": "GREEN", "category": "economics"},
    {"point": "Control: 1/5 board seat, standard protective provisions", "flag": "GREEN", "category": "governance"},
    {"point": "Drag-along risk if larger investors align", "flag": "AMBER", "category": "governance"},
    ...up to 10 bullets
  ],
  
  "transaction_snapshot": {
    "round_type": "Series A",
    "security": "Series A Preferred Stock",
    "pre_money_valuation": 20000000,
    "post_money_valuation": 25000000,
    "round_size": 5000000,
    "price_per_share": 1.50,
    "option_pool": {
      "size": 0.15,
      "pre_money": true
    }
  },
  
  "cross_document_issues": {
    "conflicts": [
      {"issue": "SHA references different board size than Articles", "documents": ["SHA.docx", "Articles.docx"], "severity": "MEDIUM"}
    ],
    "missing_documents": ["Disclosure Schedules not provided"],
    "inconsistencies": ["Different defined terms used across documents"]
  },
  
  "flag_summary": {
    "economics": {"flag": "GREEN", "justification": "Market-standard 1x non-participating with broad-based weighted average anti-dilution"},
    "governance": {"flag": "AMBER", "justification": "Standard protective provisions but limited blocking rights on key matters"},
    "dilution": {"flag": "GREEN", "justification": "15% option pool pre-money is typical for Series A"},
    "investor_rights": {"flag": "GREEN", "justification": "Standard information rights and pro-rata participation"},
    "legal_risk": {"flag": "GREEN", "justification": "Standard Delaware law, reasonable reps and warranties"}
  },
  
  "jurisdiction": "US",
  "instrument_type": "US_PRICED_EQUITY",
  
  "key_action_items": [
    "Confirm board seat allocation with founders",
    "Review disclosure schedules when provided"
  ]
}

Calibrate flags appropriately:
- GREEN: Market-standard, no concerns
- AMBER: Slightly aggressive but acceptable, or needs attention
- RED: Unusual/concerning terms that need negotiation

Be concise but comprehensive. Focus on what matters to an investment team making a go/no-go decision.`;

// =============================================================================
// PHASE 3 PROCESSOR
// =============================================================================

export async function processPhase3Synthesis(
  input: Phase3Input,
  onProgress?: (status: string) => void
): Promise<Phase3Result> {
  const startTime = Date.now();
  
  const result: Phase3Result = {
    status: 'processing',
    executiveSummary: [],
    flagSummary: {
      economics: { flag: 'AMBER', justification: 'Analysis in progress' },
      governance: { flag: 'AMBER', justification: 'Analysis in progress' },
      dilution: { flag: 'AMBER', justification: 'Analysis in progress' },
      investorRights: { flag: 'AMBER', justification: 'Analysis in progress' },
      legalRisk: { flag: 'AMBER', justification: 'Analysis in progress' }
    },
    jurisdiction: 'Unknown',
    instrumentType: 'OTHER',
    analyzedDocuments: input.phase1Results.map(d => d.filename),
    startedAt: new Date().toISOString()
  };
  
  try {
    onProgress?.('Synthesizing deal analysis...');
    
    // Build context from Phase 1 results
    const phase1Summary = input.phase1Results
      .filter(d => d.status === 'complete')
      .map(d => ({
        filename: d.filename,
        type: d.documentType,
        category: d.category,
        jurisdiction: d.jurisdiction,
        keyTerms: d.keyTerms,
        flags: d.quickFlags
      }));
    
    // Build context from Phase 2 results
    const phase2Summary = input.phase2Results
      .filter(r => r.status === 'complete')
      .map(r => ({
        category: r.category,
        analysis: r.analysis,
        summary: r.summary,
        flag: r.categoryFlag,
        documents: r.sourceDocuments
      }));
    
    // Determine majority jurisdiction
    const jurisdictions = input.phase1Results
      .map(d => d.jurisdiction)
      .filter(j => j && j !== 'Unknown');
    const jurisdictionCounts = jurisdictions.reduce((acc, j) => {
      acc[j!] = (acc[j!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const majorityJurisdiction = Object.entries(jurisdictionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
    
    // Call GPT-4o for synthesis
    const openai = getOpenAI();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYNTHESIS_PROMPT },
        { 
          role: 'user', 
          content: `Synthesize the following deal analysis into a unified assessment.

COMPANY: ${input.companyName || 'Unknown Company'}
DOCUMENTS ANALYZED: ${input.phase1Results.length}
PRIMARY JURISDICTION: ${majorityJurisdiction}

=== PHASE 1: DOCUMENT CLASSIFICATIONS ===
${JSON.stringify(phase1Summary, null, 2)}

=== PHASE 2: CATEGORY ANALYSES ===
${JSON.stringify(phase2Summary, null, 2)}

Produce a comprehensive deal synthesis as specified.`
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
        
        // Map executive summary
        result.executiveSummary = (parsed.executive_summary || []).map((item: any) => ({
          point: item.point || item.text || '',
          flag: item.flag || 'AMBER',
          category: item.category || 'general'
        }));
        
        // Map transaction snapshot
        if (parsed.transaction_snapshot) {
          result.transactionSnapshot = {
            roundType: parsed.transaction_snapshot.round_type || '',
            security: parsed.transaction_snapshot.security || '',
            preMoneyValuation: parsed.transaction_snapshot.pre_money_valuation,
            postMoneyValuation: parsed.transaction_snapshot.post_money_valuation,
            roundSize: parsed.transaction_snapshot.round_size,
            pricePerShare: parsed.transaction_snapshot.price_per_share,
            optionPool: parsed.transaction_snapshot.option_pool ? {
              size: parsed.transaction_snapshot.option_pool.size || 0,
              preMoney: parsed.transaction_snapshot.option_pool.pre_money || false
            } : undefined
          };
        }
        
        // Map cross-document issues
        if (parsed.cross_document_issues) {
          result.crossDocumentIssues = {
            conflicts: (parsed.cross_document_issues.conflicts || []).map((c: any) => ({
              issue: c.issue || '',
              documents: c.documents || [],
              severity: c.severity || 'MEDIUM'
            })),
            missingDocuments: parsed.cross_document_issues.missing_documents || [],
            inconsistencies: parsed.cross_document_issues.inconsistencies || []
          };
        }
        
        // Map flag summary
        if (parsed.flag_summary) {
          result.flagSummary = {
            economics: {
              flag: parsed.flag_summary.economics?.flag || 'AMBER',
              justification: parsed.flag_summary.economics?.justification || ''
            },
            governance: {
              flag: parsed.flag_summary.governance?.flag || 'AMBER',
              justification: parsed.flag_summary.governance?.justification || ''
            },
            dilution: {
              flag: parsed.flag_summary.dilution?.flag || 'AMBER',
              justification: parsed.flag_summary.dilution?.justification || ''
            },
            investorRights: {
              flag: parsed.flag_summary.investor_rights?.flag || 'AMBER',
              justification: parsed.flag_summary.investor_rights?.justification || ''
            },
            legalRisk: {
              flag: parsed.flag_summary.legal_risk?.flag || 'AMBER',
              justification: parsed.flag_summary.legal_risk?.justification || ''
            }
          };
        }
        
        result.jurisdiction = parsed.jurisdiction || majorityJurisdiction;
        result.instrumentType = parsed.instrument_type || 'OTHER';
        
      } catch (parseError) {
        console.warn('[Phase3] Failed to parse synthesis response');
        result.executiveSummary = [{
          point: 'Analysis completed but synthesis parsing failed',
          flag: 'AMBER',
          category: 'general'
        }];
      }
    }
    
    result.status = 'complete';
    result.completedAt = new Date().toISOString();
    result.totalDurationMs = Date.now() - startTime;
    
    console.log(`[Phase3] Synthesis complete in ${result.totalDurationMs}ms`);
    
    return result;
    
  } catch (error: any) {
    console.error('[Phase3] Synthesis error:', error.message);
    
    result.status = 'error';
    result.error = error.message;
    result.completedAt = new Date().toISOString();
    result.totalDurationMs = Date.now() - startTime;
    
    return result;
  }
}

