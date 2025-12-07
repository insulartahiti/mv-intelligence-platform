/**
 * Legal Document Extractor
 * 
 * Extracts structured legal terms from investor documentation using GPT-5.1 vision.
 * Supports PDF and Word (.docx) documents.
 * Follows the same patterns as the financial unified_extractor.ts.
 */

import OpenAI from 'openai';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { 
  LegalAnalysisResult, 
  LegalAnalysisRequest, 
  LegalAnalysisResponse,
  SourceLocation,
  ExecutiveSummaryPoint,
  Flag,
  InstrumentType
} from './types';
import { LEGAL_ANALYSIS_SYSTEM_PROMPT, OUTPUT_JSON_SCHEMA } from './prompts/investor_doc_analyzer';

// =============================================================================
// DOCUMENT TYPES & GROUPING
// =============================================================================

export interface DocumentInfo {
  filename: string;
  buffer: Buffer;
  fileType: 'pdf' | 'docx';
  category?: DocumentCategory;
  extractedText?: string;
}

export type DocumentCategory = 
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
  | 'disclosure_schedule'
  | 'other';

export interface DocumentGroup {
  id: string;
  category: 'priced_equity_bundle' | 'convertible_bundle' | 'standalone' | 'mixed';
  documents: DocumentInfo[];
  primaryDocument?: DocumentInfo;
}

/**
 * Classify document type from filename and content
 */
export function classifyDocumentCategory(filename: string, content?: string): DocumentCategory {
  const lower = filename.toLowerCase();
  const contentLower = content?.toLowerCase() || '';
  
  // Term Sheet
  if (lower.includes('term sheet') || lower.includes('termsheet') || lower.includes('term_sheet')) {
    return 'term_sheet';
  }
  
  // SAFE
  if (lower.includes('safe') || contentLower.includes('simple agreement for future equity')) {
    return 'safe';
  }
  
  // Convertible Note
  if (lower.includes('convertible note') || lower.includes('promissory note') || lower.includes('note purchase')) {
    return 'convertible_note';
  }
  
  // CLA
  if (lower.includes('cla') || lower.includes('convertible loan')) {
    return 'cla';
  }
  
  // Stock Purchase Agreement
  if (lower.includes('spa') || lower.includes('stock purchase') || lower.includes('share purchase') || 
      lower.includes('subscription agreement')) {
    return 'spa_stock_purchase';
  }
  
  // Shareholders Agreement
  if (lower.includes('sha') || lower.includes('shareholders agreement') || lower.includes('shareholder agreement') ||
      lower.includes('stockholders agreement')) {
    return 'sha_shareholders_agreement';
  }
  
  // Investor Rights Agreement
  if (lower.includes('ira') || lower.includes('investor rights') || lower.includes('registration rights')) {
    return 'ira_investor_rights';
  }
  
  // Voting Agreement
  if (lower.includes('voting agreement') || lower.includes('voting rights')) {
    return 'voting_agreement';
  }
  
  // Articles/Charter
  if (lower.includes('article') || lower.includes('charter') || lower.includes('certificate of incorporation') ||
      lower.includes('bylaws') || lower.includes('memorandum')) {
    return 'articles_charter';
  }
  
  // Side Letter
  if (lower.includes('side letter') || lower.includes('side_letter') || lower.includes('sideletter')) {
    return 'side_letter';
  }
  
  // Disclosure Schedule
  if (lower.includes('disclosure') || lower.includes('schedule')) {
    return 'disclosure_schedule';
  }
  
  return 'other';
}

/**
 * Group related documents together for combined analysis
 */
export function groupDocuments(documents: DocumentInfo[]): DocumentGroup[] {
  if (documents.length === 0) return [];
  if (documents.length === 1) {
    return [{
      id: crypto.randomUUID(),
      category: 'standalone',
      documents,
      primaryDocument: documents[0]
    }];
  }
  
  // Classify all documents
  for (const doc of documents) {
    doc.category = classifyDocumentCategory(doc.filename, doc.extractedText);
  }
  
  // Check for priced equity bundle (SPA + SHA + IRA + Voting + Articles)
  const hasSPA = documents.some(d => d.category === 'spa_stock_purchase');
  const hasSHA = documents.some(d => d.category === 'sha_shareholders_agreement');
  const hasIRA = documents.some(d => d.category === 'ira_investor_rights');
  
  // Check for convertible bundle (SAFE/Note/CLA + Side Letter)
  const hasSAFE = documents.some(d => d.category === 'safe');
  const hasNote = documents.some(d => d.category === 'convertible_note');
  const hasCLA = documents.some(d => d.category === 'cla');
  const hasSideLetter = documents.some(d => d.category === 'side_letter');
  
  const groups: DocumentGroup[] = [];
  
  // Priced equity bundle
  if ((hasSPA || hasSHA) && (hasSPA || hasSHA || hasIRA)) {
    const bundleDocs = documents.filter(d => 
      ['spa_stock_purchase', 'sha_shareholders_agreement', 'ira_investor_rights', 
       'voting_agreement', 'articles_charter', 'disclosure_schedule', 'term_sheet'].includes(d.category!)
    );
    
    if (bundleDocs.length > 0) {
      const primary = bundleDocs.find(d => d.category === 'spa_stock_purchase') ||
                     bundleDocs.find(d => d.category === 'sha_shareholders_agreement') ||
                     bundleDocs.find(d => d.category === 'term_sheet') ||
                     bundleDocs[0];
      
      groups.push({
        id: crypto.randomUUID(),
        category: 'priced_equity_bundle',
        documents: bundleDocs,
        primaryDocument: primary
      });
    }
  }
  
  // Convertible bundle
  if (hasSAFE || hasNote || hasCLA) {
    const convertibleDocs = documents.filter(d => 
      ['safe', 'convertible_note', 'cla', 'side_letter'].includes(d.category!)
    );
    
    // Only create bundle if not already grouped
    const ungrouped = convertibleDocs.filter(d => 
      !groups.some(g => g.documents.includes(d))
    );
    
    if (ungrouped.length > 0) {
      const primary = ungrouped.find(d => d.category === 'safe') ||
                     ungrouped.find(d => d.category === 'convertible_note') ||
                     ungrouped.find(d => d.category === 'cla') ||
                     ungrouped[0];
      
      groups.push({
        id: crypto.randomUUID(),
        category: 'convertible_bundle',
        documents: ungrouped,
        primaryDocument: primary
      });
    }
  }
  
  // Add remaining documents as standalone
  const grouped = new Set(groups.flatMap(g => g.documents));
  const standalone = documents.filter(d => !grouped.has(d));
  
  for (const doc of standalone) {
    groups.push({
      id: crypto.randomUUID(),
      category: 'standalone',
      documents: [doc],
      primaryDocument: doc
    });
  }
  
  return groups;
}

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for legal document analysis');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials required for snippet storage');
  }
  
  return createClient(url, key);
}

// =============================================================================
// PDF PROCESSING
// =============================================================================

/**
 * Convert PDF buffer to base64 data URL for OpenAI vision API
 */
function pdfToBase64DataUrl(buffer: Buffer): string {
  const base64 = buffer.toString('base64');
  return `data:application/pdf;base64,${base64}`;
}

/**
 * Convert PDF pages to images for vision processing
 * Returns array of base64 image data URLs
 */
async function convertPDFPagesToImages(pdfBuffer: Buffer): Promise<string[]> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  
  // For now, we'll send the PDF directly - GPT-5.1 can process PDFs natively
  // If we need individual page images later, we can use pdf2pic or similar
  
  // Return the full PDF as a single data URL
  // GPT-5.1 will process all pages
  return [pdfToBase64DataUrl(pdfBuffer)];
}

/**
 * Get page count from PDF
 */
async function getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

// =============================================================================
// WORD DOCUMENT PROCESSING
// =============================================================================

/**
 * Extract text from Word document (.docx) using mammoth
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    console.log('[DOCX] Starting text extraction, buffer size:', buffer.length);
    console.log('[DOCX] Buffer is Buffer:', Buffer.isBuffer(buffer));
    
    const result = await mammoth.extractRawText({ buffer });
    console.log('[DOCX] Extraction successful, text length:', result.value.length);
    
    if (result.messages && result.messages.length > 0) {
      console.log('[DOCX] Extraction messages:', result.messages);
    }
    
    return result.value;
  } catch (error: any) {
    console.error('[DOCX] Failed to extract text from DOCX:', error);
    console.error('[DOCX] Error stack:', error.stack);
    throw new Error(`Failed to process Word document: ${error.message}`);
  }
}

/**
 * Extract text from old Word document (.doc) using word-extractor
 */
async function extractTextFromDoc(buffer: Buffer): Promise<string> {
  try {
    console.log('[DOC] Starting text extraction from .doc file, buffer size:', buffer.length);
    
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    const text = doc.getBody();
    
    console.log('[DOC] Extraction successful, text length:', text.length);
    return text;
  } catch (error: any) {
    console.error('[DOC] Failed to extract text from DOC:', error);
    console.error('[DOC] Error stack:', error.stack);
    throw new Error(`Failed to process .doc file: ${error.message}`);
  }
}

/**
 * Extract text from any Word document (.doc or .docx)
 * Automatically detects format and uses appropriate extractor
 */
async function extractTextFromWord(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase();
  
  // First, try to determine format from extension
  if (ext.endsWith('.docx')) {
    try {
      return await extractTextFromDocx(buffer);
    } catch (docxError: any) {
      // If DOCX extraction fails with "end of central directory" error,
      // it might be a .doc file with wrong extension
      if (docxError.message.includes('central directory') || docxError.message.includes('zip')) {
        console.log('[Word] DOCX extraction failed, trying .doc format...');
        try {
          return await extractTextFromDoc(buffer);
        } catch (docError) {
          // Both failed, throw original error
          throw docxError;
        }
      }
      throw docxError;
    }
  } else if (ext.endsWith('.doc')) {
    try {
      return await extractTextFromDoc(buffer);
    } catch (docError: any) {
      // If DOC extraction fails, try DOCX (might be misnamed)
      console.log('[Word] DOC extraction failed, trying .docx format...');
      try {
        return await extractTextFromDocx(buffer);
      } catch (docxError) {
        // Both failed, throw original error
        throw docError;
      }
    }
  }
  
  // Unknown extension, try both
  try {
    return await extractTextFromDocx(buffer);
  } catch {
    return await extractTextFromDoc(buffer);
  }
}

/**
 * Extract HTML from Word document (preserves some formatting)
 */
async function extractHtmlFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.convertToHtml({ buffer });
    if (result.messages.length > 0) {
      console.warn('DOCX conversion warnings:', result.messages);
    }
    return result.value;
  } catch (error) {
    console.error('Failed to convert DOCX to HTML:', error);
    throw new Error('Failed to process Word document');
  }
}

/**
 * Determine file type from filename
 */
function getFileType(filename: string): 'pdf' | 'docx' | 'unknown' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  return 'unknown';
}

/**
 * Prepare document content for LLM analysis
 * Returns text content and/or base64 data URL depending on file type
 */
async function prepareDocumentContent(doc: DocumentInfo): Promise<{
  textContent?: string;
  imageUrl?: string;
  pageCount?: number;
}> {
  if (doc.fileType === 'docx') {
    const text = await extractTextFromWord(doc.buffer, doc.filename);
    return { textContent: text };
  } else if (doc.fileType === 'pdf') {
    const pageCount = await getPDFPageCount(doc.buffer);
    const imageUrl = pdfToBase64DataUrl(doc.buffer);
    return { imageUrl, pageCount };
  }
  
  throw new Error(`Unsupported file type for ${doc.filename}`);
}

// =============================================================================
// SNIPPET GENERATION
// =============================================================================

interface SnippetAnnotation {
  label: string;
  value: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Extract a single page from PDF and add highlight annotations
 */
async function extractPageSnippet(
  pdfBuffer: Buffer,
  pageNumber: number,
  annotations?: SnippetAnnotation[]
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const snippetDoc = await PDFDocument.create();
  
  // Copy the page (indices are 0-based)
  const [page] = await snippetDoc.copyPages(srcDoc, [pageNumber - 1]);
  snippetDoc.addPage(page);
  
  // Add annotations if provided
  if (annotations && annotations.length > 0) {
    const addedPage = snippetDoc.getPages()[0];
    const { width, height } = addedPage.getSize();
    const font = await snippetDoc.embedFont(StandardFonts.Helvetica);
    
    // Motive brand colors
    const highlightColor = rgb(0.8, 0.2, 0.2);  // Red for legal terms
    const labelBgColor = rgb(1, 0.95, 0.9);     // Light red
    const textColor = rgb(0.1, 0.1, 0.1);       // Dark gray
    
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      let x: number, y: number, boxWidth: number, boxHeight: number;
      
      if (annotation.bbox) {
        x = annotation.bbox.x * width;
        y = height - (annotation.bbox.y * height) - (annotation.bbox.height * height);
        boxWidth = annotation.bbox.width * width;
        boxHeight = annotation.bbox.height * height;
      } else {
        // Default positioning
        const margin = 50;
        boxWidth = 200;
        boxHeight = 30;
        x = margin;
        y = height - margin - (i * 40) - boxHeight;
      }
      
      // Draw highlight rectangle
      addedPage.drawRectangle({
        x: x - 5,
        y: y - 5,
        width: boxWidth + 10,
        height: boxHeight + 10,
        borderColor: highlightColor,
        borderWidth: 2,
      });
      
      // Draw label
      const labelText = `${annotation.label}: ${annotation.value}`;
      const labelFontSize = 8;
      const labelWidth = font.widthOfTextAtSize(labelText, labelFontSize);
      
      addedPage.drawRectangle({
        x: x - 4,
        y: y + boxHeight + 8,
        width: Math.min(labelWidth + 8, boxWidth),
        height: 14,
        color: labelBgColor,
        borderColor: highlightColor,
        borderWidth: 1,
      });
      
      addedPage.drawText(labelText.substring(0, 50), {
        x: x,
        y: y + boxHeight + 10,
        size: labelFontSize,
        font,
        color: textColor,
      });
    }
  }
  
  const snippetBytes = await snippetDoc.save();
  return Buffer.from(snippetBytes);
}

/**
 * Upload snippet to Supabase storage and return signed URL
 */
async function uploadSnippet(
  analysisId: string,
  section: string,
  pageNumber: number,
  snippetBuffer: Buffer
): Promise<string> {
  const supabase = getSupabase();
  const filename = `${analysisId}/${section}_page${pageNumber}.pdf`;
  
  const { error } = await supabase.storage
    .from('legal-snippets')
    .upload(filename, snippetBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });
    
  if (error) {
    console.error('Failed to upload snippet:', error);
    throw error;
  }
  
  // Generate signed URL (valid for 1 year)
  const { data } = await supabase.storage
    .from('legal-snippets')
    .createSignedUrl(filename, 365 * 24 * 60 * 60);
    
  return data?.signedUrl || '';
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Analyze a legal document and extract structured terms
 * Supports both PDF and Word (.docx) documents
 */
export async function analyzeLegalDocument(
  request: LegalAnalysisRequest
): Promise<LegalAnalysisResponse> {
  const openai = getOpenAI();
  const { fileBuffer, filename, companyId, dryRun } = request;
  
  console.log(`[Legal Analysis] Starting analysis of ${filename}`);
  
  // Determine file type
  const fileType = getFileType(filename);
  if (fileType === 'unknown') {
    return {
      success: false,
      error: 'Unsupported file type. Please upload a PDF or Word document (.docx)'
    };
  }
  
  try {
    let pageCount = 0;
    let messageContent: any[];
    
    if (fileType === 'pdf') {
      // PDF: Use vision API
      pageCount = await getPDFPageCount(fileBuffer);
      console.log(`[Legal Analysis] PDF document has ${pageCount} pages`);
      
      const pdfBase64 = pdfToBase64DataUrl(fileBuffer);
      
      messageContent = [
        {
          type: 'text',
          text: `Analyze this investor documentation and extract all key terms following the schema provided. Document: ${filename}

IMPORTANT: For every key term you extract, include source_locations with the page number where you found it. If you can identify the specific location on the page, include bbox coordinates (as percentages from 0-1).

Return your analysis as a JSON object matching the required schema.`
        },
        {
          type: 'image_url',
          image_url: {
            url: pdfBase64,
            detail: 'high'
          }
        }
      ];
    } else {
      // Word document: Extract text and use text-based analysis
      console.log(`[Legal Analysis] Extracting text from Word document...`);
      const textContent = await extractTextFromWord(fileBuffer, filename);
      const wordCount = textContent.split(/\s+/).length;
      console.log(`[Legal Analysis] Word document has ~${wordCount} words`);
      
      messageContent = [
        {
          type: 'text',
          text: `Analyze this investor documentation and extract all key terms following the schema provided.

Document: ${filename}

DOCUMENT CONTENT:
${textContent}

---

IMPORTANT: Since this is a text document, you cannot provide visual bounding boxes. Instead, quote the relevant text excerpts in the source_locations.extracted_text field.

Return your analysis as a JSON object matching the required schema.`
        }
      ];
    }
    
    // Call GPT-5.1
    console.log(`[Legal Analysis] Calling GPT-5.1 for extraction...`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1', // Primary model
      messages: [
        {
          role: 'system',
          content: LEGAL_ANALYSIS_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: messageContent
        }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 16000,
      temperature: 0.1, // Low temperature for consistent extraction
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-5.1');
    }
    
    // Parse the JSON response
    let analysis: LegalAnalysisResult;
    try {
      analysis = JSON.parse(content);
    } catch (parseError) {
      console.error('[Legal Analysis] Failed to parse JSON response:', content.substring(0, 500));
      throw new Error('Failed to parse analysis response as JSON');
    }
    
    // Add metadata
    analysis.document_name = filename;
    analysis.analysis_date = new Date().toISOString();
    analysis.model_version = 'gpt-5.1';
    
    console.log(`[Legal Analysis] Extraction complete. Jurisdiction: ${analysis.jurisdiction}, Type: ${analysis.instrument_type}`);
    
    // Generate snippets for key terms (PDF only - Word docs don't have visual pages)
    const snippets: { section: string; page: number; url: string }[] = [];
    
    if (!dryRun) {
      // Generate a unique analysis ID
      const analysisId = crypto.randomUUID();
      
      // Collect all source locations from the analysis
      const sourceLocations = collectSourceLocations(analysis);
      
      // Only generate visual snippets for PDFs
      if (fileType === 'pdf' && pageCount > 0) {
        // Group by page and generate snippets
        const pageGroups = groupByPage(sourceLocations);
        
        for (const [pageNum, locations] of Object.entries(pageGroups)) {
          const page = parseInt(pageNum);
          if (page < 1 || page > pageCount) continue;
          
          try {
            const annotations: SnippetAnnotation[] = locations.map(loc => ({
              label: loc.section,
              value: loc.term_key || '',
              bbox: loc.bbox
            }));
            
            const snippetBuffer = await extractPageSnippet(fileBuffer, page, annotations);
            const snippetUrl = await uploadSnippet(analysisId, `page${page}`, page, snippetBuffer);
            
            snippets.push({
              section: locations.map(l => l.section).join(', '),
              page,
              url: snippetUrl
            });
            
            // Update source locations with snippet URLs
            for (const loc of locations) {
              if (loc.sourceLocation) {
                loc.sourceLocation.snippet_url = snippetUrl;
              }
            }
          } catch (err) {
            console.warn(`[Legal Analysis] Failed to generate snippet for page ${page}:`, err);
          }
        }
      }
      
      // Save to database
      const supabase = getSupabase();
      
      // Extract jurisdiction and instrument type with fallbacks
      const docType = analysis.instrument_type || analysis.document_type || analysis.type || 'OTHER';
      const jurisdiction = analysis.jurisdiction || 'Unknown';
      
      const { data: insertedAnalysis, error: insertError } = await supabase
        .from('legal_analyses')
        .insert({
          company_id: companyId || null,
          document_name: filename,
          document_type: docType,
          jurisdiction: jurisdiction,
          analysis: analysis,
          executive_summary: analysis.executive_summary || analysis.rag_summary || analysis.summary,
          flags: analysis.flag_summary || analysis.flags
        })
        .select('id')
        .single();
        
      if (insertError) {
        console.error('[Legal Analysis] Failed to save analysis:', insertError);
      } else {
        // Save term sources for audit trail
        const termSources = sourceLocations.map(loc => ({
          analysis_id: insertedAnalysis.id,
          section: loc.section,
          term_key: loc.term_key,
          extracted_value: loc.extracted_value,
          page_number: loc.page,
          snippet_url: loc.sourceLocation?.snippet_url,
          bbox: loc.bbox,
          confidence: loc.confidence
        }));
        
        if (termSources.length > 0) {
          const { error: sourcesError } = await supabase
            .from('legal_term_sources')
            .insert(termSources);
            
          if (sourcesError) {
            console.warn('[Legal Analysis] Failed to save term sources:', sourcesError);
          }
        }
        
        return {
          success: true,
          analysis,
          analysisId: insertedAnalysis.id,
          snippets
        };
      }
    }
    
    return {
      success: true,
      analysis,
      snippets
    };
    
  } catch (error: any) {
    console.error('[Legal Analysis] Error:', error);
    
    // Try fallback to gpt-4o if gpt-5.1 fails
    if (error.message?.includes('model') || error.code === 'model_not_found') {
      console.log('[Legal Analysis] Falling back to gpt-4o...');
      return analyzeLegalDocumentFallback(request);
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error during analysis'
    };
  }
}

/**
 * Fallback analysis using gpt-4o if gpt-5.1 is unavailable
 */
async function analyzeLegalDocumentFallback(
  request: LegalAnalysisRequest
): Promise<LegalAnalysisResponse> {
  const openai = getOpenAI();
  const { fileBuffer, filename } = request;
  
  const fileType = getFileType(filename);
  let messageContent: any[];
  
  if (fileType === 'docx') {
    const textContent = await extractTextFromWord(fileBuffer, filename);
    messageContent = [
      {
        type: 'text',
        text: `Analyze this investor documentation: ${filename}. Return analysis as JSON.\n\nDOCUMENT CONTENT:\n${textContent}`
      }
    ];
  } else {
    const pdfBase64 = pdfToBase64DataUrl(fileBuffer);
    messageContent = [
      {
        type: 'text',
        text: `Analyze this investor documentation: ${filename}. Return analysis as JSON.`
      },
      {
        type: 'image_url',
        image_url: {
          url: pdfBase64,
          detail: 'high'
        }
      }
    ];
  }
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: LEGAL_ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: messageContent
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 16000,
    temperature: 0.1,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { success: false, error: 'No response from fallback model' };
  }
  
  const analysis = JSON.parse(content) as LegalAnalysisResult;
  analysis.document_name = filename;
  analysis.analysis_date = new Date().toISOString();
  analysis.model_version = 'gpt-4o (fallback)';
  
  return { success: true, analysis };
}

// =============================================================================
// MULTI-DOCUMENT / GROUPED ANALYSIS
// =============================================================================

/**
 * Analyze a group of related documents together
 * This provides better context when analyzing a deal package (e.g., SPA + SHA + Side Letter)
 */
export async function analyzeDocumentGroup(
  group: DocumentGroup,
  companyId?: string,
  dryRun = false
): Promise<LegalAnalysisResponse> {
  const openai = getOpenAI();
  
  console.log(`[Legal Analysis] Analyzing document group: ${group.category} with ${group.documents.length} documents`);
  
  const skippedFiles: string[] = [];
  
  try {
    // Prepare content from all documents
    const documentContents: string[] = [];
    const pdfBuffers: { filename: string; buffer: Buffer }[] = [];
    
    for (const doc of group.documents) {
      if (doc.fileType === 'docx') {
        try {
          const text = await extractTextFromWord(doc.buffer, doc.filename);
          documentContents.push(`\n=== DOCUMENT: ${doc.filename} (${doc.category || 'unknown'}) ===\n${text}`);
        } catch (docErr: any) {
          console.warn(`[Legal Analysis] Skipping invalid Word file ${doc.filename}:`, docErr.message);
          skippedFiles.push(doc.filename);
        }
      } else if (doc.fileType === 'pdf') {
        pdfBuffers.push({ filename: doc.filename, buffer: doc.buffer });
        // We'll include PDFs as images
      }
    }
    
    // If all documents failed, return error
    if (documentContents.length === 0 && pdfBuffers.length === 0) {
      return {
        success: false,
        error: `All documents in group failed to process. Skipped files: ${skippedFiles.join(', ')}`
      };
    }
    
    // Build the prompt with grouped context
    const groupContext = `You are analyzing a bundle of related legal documents for a single investment deal.

DOCUMENT BUNDLE TYPE: ${group.category}
PRIMARY DOCUMENT: ${group.primaryDocument?.filename || 'Not specified'}
TOTAL DOCUMENTS: ${group.documents.length}

Documents in this bundle:
${group.documents.map(d => `- ${d.filename} (${d.category || 'unclassified'})`).join('\n')}

IMPORTANT: Analyze these documents as a cohesive deal package. Cross-reference terms between documents. 
For example:
- The Term Sheet may outline high-level economics, while the SPA has the detailed terms
- Side Letters may modify standard terms in the main agreement
- The SHA typically has governance details while the SPA has economics
- Look for any conflicts or inconsistencies between documents

Consolidate your analysis into a single comprehensive output that reflects the complete deal terms.

Return your response as a valid JSON object matching the required schema.`;

    // Build message content
    const messageContent: any[] = [
      {
        type: 'text',
        text: `${groupContext}\n\n${documentContents.join('\n\n')}`
      }
    ];
    
    // Add PDF images (up to 3 to stay within limits)
    for (const pdf of pdfBuffers.slice(0, 3)) {
      const base64 = pdfToBase64DataUrl(pdf.buffer);
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: base64,
          detail: 'high'
        }
      });
    }
    
    console.log(`[Legal Analysis] Calling GPT-5.1 for grouped analysis...`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: LEGAL_ANALYSIS_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: messageContent
        }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 20000, // Larger for grouped analysis
      temperature: 0.1,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-5.1');
    }
    
    const analysis = JSON.parse(content) as LegalAnalysisResult;
    
    // Add metadata
    const processedDocs = group.documents.filter(d => !skippedFiles.includes(d.filename));
    analysis.document_name = processedDocs.map(d => d.filename).join(' + ');
    analysis.analysis_date = new Date().toISOString();
    analysis.model_version = 'gpt-5.1 (grouped)';
    
    if (skippedFiles.length > 0) {
      console.warn(`[Legal Analysis] Skipped ${skippedFiles.length} invalid files: ${skippedFiles.join(', ')}`);
    }
    
    console.log(`[Legal Analysis] Grouped extraction complete. Jurisdiction: ${analysis.jurisdiction}, Type: ${analysis.instrument_type}`);
    
    // Save to database if not dry run
    if (!dryRun) {
      const supabase = getSupabase();
      
      // Extract jurisdiction and instrument type with fallbacks
      const docType = analysis.instrument_type || analysis.document_type || analysis.type || 'OTHER';
      const jurisdictionValue = analysis.jurisdiction || 'Unknown';
      
      const { data: insertedAnalysis, error: insertError } = await supabase
        .from('legal_analyses')
        .insert({
          company_id: companyId || null,
          document_name: analysis.document_name,
          document_type: docType,
          jurisdiction: jurisdictionValue,
          analysis: analysis,
          executive_summary: analysis.executive_summary || analysis.rag_summary || analysis.summary,
          flags: analysis.flag_summary || analysis.flags
        })
        .select('id')
        .single();
        
      if (insertError) {
        console.error('[Legal Analysis] Failed to save grouped analysis:', insertError);
      } else {
        return {
          success: true,
          analysis,
          analysisId: insertedAnalysis.id,
          snippets: []
        };
      }
    }
    
    return {
      success: true,
      analysis,
      snippets: []
    };
    
  } catch (error: any) {
    console.error('[Legal Analysis] Grouped analysis error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during grouped analysis'
    };
  }
}

/**
 * Analyze multiple documents, automatically grouping related ones
 */
export async function analyzeMultipleDocuments(
  files: { filename: string; buffer: Buffer }[],
  companyId?: string,
  dryRun = false
): Promise<{ groups: DocumentGroup[]; results: LegalAnalysisResponse[] }> {
  // Convert to DocumentInfo
  const documents: DocumentInfo[] = files.map(f => ({
    filename: f.filename,
    buffer: f.buffer,
    fileType: getFileType(f.filename) as 'pdf' | 'docx'
  }));
  
  // Filter out unsupported file types
  const supported = documents.filter(d => d.fileType !== 'unknown' as any);
  
  if (supported.length === 0) {
    return { groups: [], results: [] };
  }
  
  // Group documents
  const groups = groupDocuments(supported);
  console.log(`[Legal Analysis] Organized ${supported.length} documents into ${groups.length} groups`);
  
  // Analyze each group
  const results: LegalAnalysisResponse[] = [];
  
  for (const group of groups) {
    if (group.documents.length === 1) {
      // Single document - use standard analysis
      const doc = group.documents[0];
      const result = await analyzeLegalDocument({
        fileBuffer: doc.buffer,
        filename: doc.filename,
        companyId,
        dryRun
      });
      results.push(result);
    } else {
      // Multiple documents - use grouped analysis
      const result = await analyzeDocumentGroup(group, companyId, dryRun);
      results.push(result);
    }
  }
  
  return { groups, results };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface CollectedSource {
  section: string;
  term_key: string;
  extracted_value?: string;
  page: number;
  bbox?: SourceLocation['bbox'];
  confidence?: number;
  sourceLocation?: SourceLocation;
}

/**
 * Collect all source locations from the analysis result
 */
function collectSourceLocations(analysis: LegalAnalysisResult): CollectedSource[] {
  const sources: CollectedSource[] = [];
  
  // Helper to extract sources from an object with source_locations
  const extractSources = (obj: any, section: string) => {
    if (!obj) return;
    
    if (obj.source_locations && Array.isArray(obj.source_locations)) {
      for (const loc of obj.source_locations) {
        if (loc.page) {
          sources.push({
            section,
            term_key: loc.clause_reference || section,
            extracted_value: loc.extracted_text,
            page: loc.page,
            bbox: loc.bbox,
            sourceLocation: loc
          });
        }
      }
    }
    
    // Recurse into nested objects
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && key !== 'source_locations') {
        extractSources(value, `${section}.${key}`);
      }
    }
  };
  
  // Extract from each main section
  extractSources(analysis.transaction_snapshot, 'transaction_snapshot');
  extractSources(analysis.economics, 'economics');
  extractSources(analysis.ownership, 'ownership');
  extractSources(analysis.control, 'control');
  extractSources(analysis.investor_rights, 'investor_rights');
  extractSources(analysis.exit, 'exit');
  extractSources(analysis.legal, 'legal');
  
  return sources;
}

/**
 * Group source locations by page number
 */
function groupByPage(sources: CollectedSource[]): Record<number, CollectedSource[]> {
  const groups: Record<number, CollectedSource[]> = {};
  
  for (const source of sources) {
    if (!groups[source.page]) {
      groups[source.page] = [];
    }
    groups[source.page].push(source);
  }
  
  return groups;
}

/**
 * Extract key flags from analysis for quick overview
 */
export function extractFlags(analysis: LegalAnalysisResult): Record<string, Flag> {
  return {
    economics: analysis.flag_summary?.economics_downside?.flag || 'AMBER',
    control: analysis.flag_summary?.control_governance?.flag || 'AMBER',
    dilution: analysis.flag_summary?.dilution_ownership?.flag || 'AMBER',
    investor_rights: analysis.flag_summary?.investor_rights_follow_on?.flag || 'AMBER',
    legal: analysis.flag_summary?.legal_gc_risk?.flag || 'AMBER'
  };
}

/**
 * Generate a quick summary suitable for display
 */
export function generateQuickSummary(analysis: LegalAnalysisResult): string[] {
  const summary: string[] = [];
  
  // Add key transaction info
  if (analysis.transaction_snapshot) {
    const ts = analysis.transaction_snapshot;
    if (ts.round_type) summary.push(`Round: ${ts.round_type}`);
    if (ts.pre_money_valuation) {
      summary.push(`Pre-money: ${ts.pre_money_valuation_currency || '$'}${(ts.pre_money_valuation / 1000000).toFixed(1)}M`);
    }
  }
  
  // Add top executive summary points
  if (analysis.executive_summary) {
    const redFlags = analysis.executive_summary.filter(p => p.flag === 'RED');
    const amberFlags = analysis.executive_summary.filter(p => p.flag === 'AMBER');
    
    for (const flag of redFlags.slice(0, 3)) {
      summary.push(`🔴 ${flag.point}`);
    }
    for (const flag of amberFlags.slice(0, 2)) {
      summary.push(`🟡 ${flag.point}`);
    }
  }
  
  return summary;
}


