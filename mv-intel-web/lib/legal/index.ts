/**
 * Legal Document Analysis Module
 * 
 * Provides tools for analyzing investor documentation including:
 * - Term sheets
 * - Stock Purchase Agreements (SPAs)
 * - Shareholders Agreements (SHAs)
 * - SAFEs (Simple Agreement for Future Equity)
 * - Convertible Loan Agreements (CLAs)
 * - Convertible notes
 * - Side letters
 * 
 * @module lib/legal
 */

// Types
export * from './types';

// Extractor
export { 
  analyzeLegalDocument,
  analyzeDocumentGroup,
  analyzeMultipleDocuments,
  groupDocuments,
  classifyDocumentCategory,
  extractFlags,
  generateQuickSummary 
} from './extractor';

// Types for document grouping
export type { 
  DocumentInfo, 
  DocumentCategory, 
  DocumentGroup 
} from './extractor';

// Classifier
export {
  classifyDocument,
  classifyFromFilename,
  classifyFromText,
  isValidInstrumentType,
  isValidJurisdiction,
  getInstrumentTypeDescription
} from './instrument_classifier';

// Prompts (for advanced use cases)
export {
  LEGAL_ANALYSIS_SYSTEM_PROMPT,
  OUTPUT_JSON_SCHEMA,
  INSTRUMENT_TYPES,
  JURISDICTION_SIGNALS,
  buildLegalAnalysisPrompt,
  getOutputSchema
} from './prompts/investor_doc_analyzer';


