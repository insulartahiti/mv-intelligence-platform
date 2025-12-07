/**
 * Phase 1: Individual Document Extraction
 * 
 * Processes each document individually to extract:
 * - Document type and category
 * - Jurisdiction
 * - Key terms (quick extraction)
 * - Raw text for later phases
 */

import OpenAI from 'openai';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { 
  Phase1Input, 
  Phase1Result, 
  DocumentSubtype, 
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
// TEXT EXTRACTION
// =============================================================================

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error: any) {
    // Try word-extractor for .doc files
    if (error.message?.includes('central directory') || error.message?.includes('zip')) {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody();
    }
    throw error;
  }
}

function pdfToBase64DataUrl(buffer: Buffer): string {
  const base64 = buffer.toString('base64');
  return `data:application/pdf;base64,${base64}`;
}

// =============================================================================
// DOCUMENT CLASSIFICATION
// =============================================================================

const SUBTYPE_TO_CATEGORY: Record<DocumentSubtype, DocumentCategory> = {
  term_sheet: 'economics',
  spa_stock_purchase: 'economics',
  safe: 'economics',
  convertible_note: 'economics',
  cla: 'economics',
  sha_shareholders_agreement: 'governance',
  ira_investor_rights: 'governance',
  voting_agreement: 'governance',
  articles_charter: 'governance',
  side_letter: 'legal_gc',
  indemnification: 'legal_gc',
  disclosure_schedule: 'legal_gc',
  management_rights: 'standalone',
  rofr_cosale: 'standalone',
  other: 'standalone'
};

function classifyFromFilename(filename: string): { subtype: DocumentSubtype; category: DocumentCategory } {
  const lower = filename.toLowerCase();
  
  let subtype: DocumentSubtype = 'other';
  
  if (lower.includes('term sheet') || lower.includes('termsheet')) {
    subtype = 'term_sheet';
  } else if (lower.includes('safe') || lower.includes('simple agreement for future equity')) {
    subtype = 'safe';
  } else if (lower.includes('convertible note') || lower.includes('promissory note')) {
    subtype = 'convertible_note';
  } else if (lower.includes('cla') || lower.includes('convertible loan')) {
    subtype = 'cla';
  } else if (lower.includes('spa') || lower.includes('stock purchase') || lower.includes('share purchase') || lower.includes('subscription')) {
    subtype = 'spa_stock_purchase';
  } else if (lower.includes('sha') || lower.includes('shareholders agreement') || lower.includes('stockholders agreement')) {
    subtype = 'sha_shareholders_agreement';
  } else if (lower.includes('ira') || lower.includes('investor rights') || lower.includes("investors' rights")) {
    subtype = 'ira_investor_rights';
  } else if (lower.includes('voting agreement') || lower.includes('voting rights')) {
    subtype = 'voting_agreement';
  } else if (lower.includes('article') || lower.includes('charter') || lower.includes('certificate of incorporation') || lower.includes('bylaws')) {
    subtype = 'articles_charter';
  } else if (lower.includes('side letter')) {
    subtype = 'side_letter';
  } else if (lower.includes('indemnif')) {
    subtype = 'indemnification';
  } else if (lower.includes('disclosure') || lower.includes('schedule')) {
    subtype = 'disclosure_schedule';
  } else if (lower.includes('management rights')) {
    subtype = 'management_rights';
  } else if (lower.includes('rofr') || lower.includes('co-sale') || lower.includes('cosale') || lower.includes('right of first refusal')) {
    subtype = 'rofr_cosale';
  }
  
  return {
    subtype,
    category: SUBTYPE_TO_CATEGORY[subtype]
  };
}

// =============================================================================
// PHASE 1 PROMPT
// =============================================================================

const PHASE1_SYSTEM_PROMPT = `You are a legal document analyzer specializing in venture capital and private equity transactions.

Your task is to classify and extract key information from a legal document.

CRITICAL RULES:
1. ONLY extract values that are EXPLICITLY stated in the document
2. If a value is not clearly stated, use null - DO NOT guess or estimate
3. For each extracted term, include the exact quote from the document as "source_quote"
4. Include approximate location as "source_location" (e.g., "Section 2.1", "Recitals", "Schedule A")

Return a JSON object with:
{
  "document_type": "term_sheet" | "spa_stock_purchase" | "sha_shareholders_agreement" | "ira_investor_rights" | "voting_agreement" | "articles_charter" | "safe" | "convertible_note" | "cla" | "side_letter" | "indemnification" | "disclosure_schedule" | "management_rights" | "rofr_cosale" | "other",
  "jurisdiction": "US" | "UK" | "Continental Europe" | "Unknown",
  "jurisdiction_source": "exact quote showing jurisdiction, e.g. 'governed by the laws of Delaware'",
  "parties": ["Party 1 name", "Party 2 name"],
  "key_terms": {
    "round_type": {"value": "Series A", "source_quote": "exact quote", "page_number": 1},
    "valuation_cap": {"value": number or null, "source_quote": "exact quote or null", "page_number": 5},
    "discount": {"value": number or null, "source_quote": "exact quote or null", "page_number": 5},
    "liquidation_preference": {"value": "1x non-participating", "source_quote": "exact quote", "page_number": 12},
    "anti_dilution": {"value": "broad-based weighted average", "source_quote": "exact quote", "page_number": 15},
    "board_seats": {"value": "description", "source_quote": "exact quote", "page_number": 20},
    "protective_provisions": [{"matter": "charter amendment", "source_quote": "quote", "page_number": 22}]
  },
  "flags": {
    "has_unusual_terms": true/false,
    "flagged_items": [{"item": "description", "source_quote": "quote", "page_number": 10, "severity": "HIGH|MEDIUM|LOW"}]
  },
  "confidence": 0.0-1.0
}

IMPORTANT:
1. If you cannot find a specific value with a clear source quote, set it to null.
2. For page_number, provide the PDF page index (1-based) where the quote appears. If uncertain, use null.
3. Never fabricate numbers.`;

// =============================================================================
// PHASE 1 PROCESSOR
// =============================================================================

export async function processPhase1Document(
  input: Phase1Input,
  onProgress?: (status: string) => void
): Promise<Phase1Result> {
  const startTime = Date.now();
  const id = crypto.randomUUID();
  
  const result: Phase1Result = {
    id,
    filename: input.filename,
    status: 'processing',
    startedAt: new Date().toISOString()
  };
  
  try {
    onProgress?.(`Extracting text from ${input.filename}...`);
    
    // Extract text based on file type
    let extractedText: string;
    
    if (input.fileType === 'docx') {
      extractedText = await extractTextFromDocx(input.buffer);
    } else {
      // For PDFs, we'll use vision API - store buffer for later
      // For now, just mark as PDF and skip text extraction
      extractedText = '[PDF - will use vision API]';
    }
    
    result.extractedText = extractedText;
    result.wordCount = extractedText.split(/\s+/).length;
    
    // Quick classification from filename
    const { subtype, category } = classifyFromFilename(input.filename);
    result.documentType = subtype;
    result.category = category;
    
    onProgress?.(`Analyzing ${input.filename}...`);
    
    // Use GPT for detailed classification and key term extraction
    const openai = getOpenAI();
    
    let messageContent: any[];
    
    if (input.fileType === 'pdf') {
      const pdfBase64 = pdfToBase64DataUrl(input.buffer);
      messageContent = [
        {
          type: 'text',
          text: `Analyze this legal document and extract key information. Filename: ${input.filename}\n\nReturn JSON as specified.`
        },
        {
          type: 'image_url',
          image_url: {
            url: pdfBase64,
            detail: 'low' // Use low detail for speed in Phase 1
          }
        }
      ];
    } else {
      // Truncate text if too long (Phase 1 is quick extraction)
      const truncatedText = extractedText.length > 15000 
        ? extractedText.substring(0, 15000) + '\n\n[... truncated for quick analysis ...]'
        : extractedText;
      
      messageContent = [
        {
          type: 'text',
          text: `Analyze this legal document and extract key information.

Filename: ${input.filename}

DOCUMENT TEXT:
${truncatedText}

Return JSON as specified.`
        }
      ];
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed in Phase 1
      messages: [
        { role: 'system', content: PHASE1_SYSTEM_PROMPT },
        { role: 'user', content: messageContent }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        
        // Update with GPT's classification (if higher confidence)
        if (parsed.document_type && parsed.confidence > 0.7) {
          result.documentType = parsed.document_type;
          result.category = SUBTYPE_TO_CATEGORY[parsed.document_type as DocumentSubtype] || category;
        }
        
        result.jurisdiction = parsed.jurisdiction || 'Unknown';
        
        result.keyTerms = {
          parties: parsed.parties,
          roundType: parsed.key_terms?.round_type,
          valuationCap: parsed.key_terms?.valuation_cap,
          discount: parsed.key_terms?.discount,
          liquidationPreference: parsed.key_terms?.liquidation_preference,
          antiDilution: parsed.key_terms?.anti_dilution,
          boardSeats: parsed.key_terms?.board_seats,
          protectiveProvisions: parsed.key_terms?.protective_provisions
        };
        
        result.quickFlags = {
          hasUnusualTerms: parsed.flags?.has_unusual_terms || false,
          flaggedItems: parsed.flags?.flagged_items || []
        };
        
      } catch (parseError) {
        console.warn(`[Phase1] Failed to parse GPT response for ${input.filename}`);
      }
    }
    
    result.status = 'complete';
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startTime;
    
    console.log(`[Phase1] Completed ${input.filename}: ${result.documentType} (${result.category}) in ${result.durationMs}ms`);
    
    return result;
    
  } catch (error: any) {
    console.error(`[Phase1] Error processing ${input.filename}:`, error.message);
    
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

export async function processPhase1Batch(
  inputs: Phase1Input[],
  onProgress?: (completed: number, total: number, current: string) => void,
  concurrency = 3
): Promise<Phase1Result[]> {
  const results: Phase1Result[] = [];
  let completed = 0;
  
  // Process in batches for controlled concurrency
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(async (input) => {
        const result = await processPhase1Document(input, (status) => {
          onProgress?.(completed, inputs.length, input.filename);
        });
        completed++;
        onProgress?.(completed, inputs.length, input.filename);
        return result;
      })
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

// =============================================================================
// HELPERS
// =============================================================================

export function groupByCategory(results: Phase1Result[]): Record<DocumentCategory, Phase1Result[]> {
  const groups: Record<DocumentCategory, Phase1Result[]> = {
    economics: [],
    governance: [],
    legal_gc: [],
    standalone: []
  };
  
  for (const result of results) {
    const category = result.category || 'standalone';
    groups[category].push(result);
  }
  
  return groups;
}

