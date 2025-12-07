/**
 * Legal Instrument Classifier
 * 
 * Quick classification of legal documents by jurisdiction and instrument type
 * before full analysis. Used for routing and initial categorization.
 */

import OpenAI from 'openai';
import { Jurisdiction, InstrumentType } from './types';
import { INSTRUMENT_TYPES, JURISDICTION_SIGNALS } from './prompts/investor_doc_analyzer';

// =============================================================================
// QUICK CLASSIFICATION
// =============================================================================

interface ClassificationResult {
  jurisdiction: Jurisdiction;
  jurisdiction_confidence: number;
  jurisdiction_signals: string[];
  instrument_type: InstrumentType;
  instrument_type_confidence: number;
  instrument_type_signals: string[];
  document_title?: string;
  parties?: string[];
}

/**
 * Quick classification of document type without full analysis
 * Uses first few pages only for speed
 */
export async function classifyDocument(
  pdfBuffer: Buffer,
  filename: string
): Promise<ClassificationResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Convert to base64
  const base64 = pdfBuffer.toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64}`;
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Use cheaper model for quick classification
    messages: [
      {
        role: 'system',
        content: `You are a legal document classifier. Analyze the document and determine:
1. JURISDICTION: US, UK, Continental Europe, or Unknown
2. INSTRUMENT TYPE: One of ${Object.keys(INSTRUMENT_TYPES).join(', ')}

Look for these signals:

US JURISDICTION SIGNALS:
${JURISDICTION_SIGNALS.US.map(s => `- ${s}`).join('\n')}

UK JURISDICTION SIGNALS:
${JURISDICTION_SIGNALS.UK.map(s => `- ${s}`).join('\n')}

CONTINENTAL EUROPE SIGNALS:
${JURISDICTION_SIGNALS['Continental Europe'].map(s => `- ${s}`).join('\n')}

INSTRUMENT TYPE DEFINITIONS:
${Object.entries(INSTRUMENT_TYPES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Return JSON with: jurisdiction, jurisdiction_confidence (0-1), jurisdiction_signals (array of matched signals), instrument_type, instrument_type_confidence (0-1), instrument_type_signals (array of matched signals), document_title, parties (array of party names)`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Classify this document: ${filename}. Focus on the first few pages to identify jurisdiction and document type.`
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: 'low' // Low detail for speed
            }
          }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
    temperature: 0.1
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No classification response');
  }
  
  return JSON.parse(content) as ClassificationResult;
}

// =============================================================================
// HEURISTIC CLASSIFICATION (NO API CALL)
// =============================================================================

/**
 * Fast heuristic-based classification from filename and text patterns
 * No API call required - useful for pre-filtering
 */
export function classifyFromFilename(filename: string): Partial<ClassificationResult> {
  const lower = filename.toLowerCase();
  const result: Partial<ClassificationResult> = {
    jurisdiction_confidence: 0.3,
    instrument_type_confidence: 0.3
  };
  
  // Jurisdiction hints from filename
  if (lower.includes('delaware') || lower.includes('nvca') || lower.includes('ycombinator') || lower.includes('yc')) {
    result.jurisdiction = 'US';
    result.jurisdiction_confidence = 0.7;
  } else if (lower.includes('uk') || lower.includes('bvca') || lower.includes('england') || lower.includes('ltd')) {
    result.jurisdiction = 'UK';
    result.jurisdiction_confidence = 0.7;
  } else if (lower.includes('gmbh') || lower.includes('sarl') || lower.includes('sas') || lower.includes('bv')) {
    result.jurisdiction = 'Continental Europe';
    result.jurisdiction_confidence = 0.7;
  }
  
  // Instrument type hints from filename
  if (lower.includes('safe') || lower.includes('simple agreement')) {
    result.instrument_type = 'US_SAFE';
    result.instrument_type_confidence = 0.8;
  } else if (lower.includes('convertible note') || lower.includes('promissory note')) {
    result.instrument_type = 'US_CONVERTIBLE_NOTE';
    result.instrument_type_confidence = 0.8;
  } else if (lower.includes('cla') || lower.includes('convertible loan')) {
    result.instrument_type = 'UK_EU_CLA';
    result.instrument_type_confidence = 0.7;
  } else if (lower.includes('term sheet')) {
    // Term sheets could be various types
    result.instrument_type_confidence = 0.3;
  } else if (lower.includes('sha') || lower.includes('shareholders agreement') || lower.includes('shareholder agreement')) {
    // Could be UK or European
    if (result.jurisdiction === 'UK') {
      result.instrument_type = 'UK_EQUITY_BVCA_STYLE';
    } else if (result.jurisdiction === 'Continental Europe') {
      result.instrument_type = 'EUROPEAN_PRICED_EQUITY';
    }
    result.instrument_type_confidence = 0.6;
  } else if (lower.includes('spa') || lower.includes('stock purchase') || lower.includes('share purchase')) {
    if (result.jurisdiction === 'US') {
      result.instrument_type = 'US_PRICED_EQUITY';
    } else if (result.jurisdiction === 'UK') {
      result.instrument_type = 'UK_EQUITY_BVCA_STYLE';
    }
    result.instrument_type_confidence = 0.6;
  } else if (lower.includes('series a') || lower.includes('series b') || lower.includes('series seed')) {
    result.instrument_type = 'US_PRICED_EQUITY';
    result.jurisdiction = 'US';
    result.instrument_type_confidence = 0.7;
    result.jurisdiction_confidence = 0.7;
  }
  
  return result;
}

/**
 * Extract text patterns that indicate document type
 * For use with OCR'd text
 */
export function classifyFromText(text: string): Partial<ClassificationResult> {
  const lower = text.toLowerCase();
  const result: Partial<ClassificationResult> = {
    jurisdiction_signals: [],
    instrument_type_signals: []
  };
  
  // Check for US signals
  for (const signal of JURISDICTION_SIGNALS.US) {
    const pattern = signal.toLowerCase().replace(/['"]/g, '');
    if (lower.includes(pattern)) {
      result.jurisdiction_signals!.push(signal);
    }
  }
  if (result.jurisdiction_signals!.length > 0) {
    result.jurisdiction = 'US';
    result.jurisdiction_confidence = Math.min(0.9, 0.3 + result.jurisdiction_signals!.length * 0.15);
  }
  
  // Check for UK signals
  for (const signal of JURISDICTION_SIGNALS.UK) {
    const pattern = signal.toLowerCase().replace(/['"]/g, '');
    if (lower.includes(pattern)) {
      result.jurisdiction_signals!.push(signal);
    }
  }
  if (result.jurisdiction_signals!.length > 2 && !result.jurisdiction) {
    result.jurisdiction = 'UK';
    result.jurisdiction_confidence = Math.min(0.9, 0.3 + result.jurisdiction_signals!.length * 0.15);
  }
  
  // Check for European signals
  for (const signal of JURISDICTION_SIGNALS['Continental Europe']) {
    const pattern = signal.toLowerCase().replace(/['"]/g, '');
    if (lower.includes(pattern)) {
      result.jurisdiction_signals!.push(signal);
    }
  }
  if (result.jurisdiction_signals!.length > 0 && !result.jurisdiction) {
    result.jurisdiction = 'Continental Europe';
    result.jurisdiction_confidence = Math.min(0.9, 0.3 + result.jurisdiction_signals!.length * 0.15);
  }
  
  // Instrument type detection
  if (lower.includes('simple agreement for future equity') || lower.includes('safe')) {
    result.instrument_type = 'US_SAFE';
    result.instrument_type_confidence = 0.9;
    result.instrument_type_signals!.push('SAFE mentioned');
  } else if (lower.includes('convertible promissory note') || lower.includes('note purchase agreement')) {
    result.instrument_type = 'US_CONVERTIBLE_NOTE';
    result.instrument_type_confidence = 0.9;
    result.instrument_type_signals!.push('Convertible note mentioned');
  } else if (lower.includes('convertible loan agreement') || lower.includes('cla')) {
    result.instrument_type = 'UK_EU_CLA';
    result.instrument_type_confidence = 0.85;
    result.instrument_type_signals!.push('CLA mentioned');
  } else if (lower.includes('series') && (lower.includes('preferred') || lower.includes('stock purchase'))) {
    result.instrument_type = 'US_PRICED_EQUITY';
    result.instrument_type_confidence = 0.85;
    result.instrument_type_signals!.push('Series preferred mentioned');
  } else if (lower.includes('bvca') || (lower.includes('subscription') && lower.includes('shareholders agreement'))) {
    result.instrument_type = 'UK_EQUITY_BVCA_STYLE';
    result.instrument_type_confidence = 0.8;
    result.instrument_type_signals!.push('BVCA style signals');
  }
  
  return result;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that an instrument type is valid
 */
export function isValidInstrumentType(type: string): type is InstrumentType {
  return Object.keys(INSTRUMENT_TYPES).includes(type);
}

/**
 * Validate that a jurisdiction is valid
 */
export function isValidJurisdiction(jurisdiction: string): jurisdiction is Jurisdiction {
  return ['US', 'UK', 'Continental Europe', 'Unknown'].includes(jurisdiction);
}

/**
 * Get human-readable description of instrument type
 */
export function getInstrumentTypeDescription(type: InstrumentType): string {
  return INSTRUMENT_TYPES[type] || 'Unknown instrument type';
}


