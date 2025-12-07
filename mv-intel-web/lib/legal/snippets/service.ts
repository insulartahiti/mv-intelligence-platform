/**
 * Legal Snippet Service
 * 
 * Orchestrates generation and storage of visual snippets.
 */

import { createClient } from '@supabase/supabase-js';
import { generateLegalSnippet, generateTextSnippet, SnippetOutput } from './generator';
import { Phase1Result } from '../pipeline/types';

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials required for snippet storage');
  }
  
  return createClient(url, key);
}

// =============================================================================
// TYPES
// =============================================================================

export interface SnippetRequest {
  pipelineId: string;
  analysisId: string;
  documents: Array<{
    filename: string;
    buffer: Buffer;
    fileType: 'pdf' | 'docx';
    results: Phase1Result;
  }>;
}

export interface SnippetResult {
  termKey: string;
  snippetUrl: string;
  pageNumber: number;
}

// =============================================================================
// HELPER: Find context in text
// =============================================================================

function findContext(fullText: string, quote: string, contextChars = 300): string {
  if (!fullText || !quote) return quote;
  
  // Normalize whitespace for search
  const normText = fullText.replace(/\s+/g, ' ');
  const normQuote = quote.replace(/\s+/g, ' ');
  
  const index = normText.indexOf(normQuote);
  if (index === -1) return quote; // Quote not found exactly, return as is
  
  const start = Math.max(0, index - contextChars / 2);
  const end = Math.min(normText.length, index + normQuote.length + contextChars / 2);
  
  let context = normText.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < normText.length) context = context + '...';
  
  return context;
}

// =============================================================================
// SERVICE
// =============================================================================

export async function generateAndStoreSnippets(
  request: SnippetRequest,
  onProgress?: (count: number, total: number) => void
): Promise<void> {
  const supabase = getSupabase();
  const bucket = 'legal-snippets';
  
  let processed = 0;
  const totalTerms = request.documents.reduce((acc, doc) => 
    acc + (doc.results.keyTerms ? Object.keys(doc.results.keyTerms).length : 0), 0);
  
  console.log(`[Snippet Service] Generating snippets for ${totalTerms} terms across ${request.documents.length} docs`);
  
  for (const doc of request.documents) {
    if (!doc.results.keyTerms) continue;
    
    const keyTerms = doc.results.keyTerms as Record<string, any>;
    const extractedText = doc.results.extractedText || '';
    
    for (const [key, data] of Object.entries(keyTerms)) {
      if (!data || typeof data !== 'object') continue;
      
      const quote = data.source_quote;
      const pageNumStr = data.page_number;
      
      try {
        let output: SnippetOutput | null = null;
        
        // Strategy 1: Visual Snippet (PDF)
        if (doc.fileType === 'pdf' && pageNumStr) {
          const pageNum = parseInt(pageNumStr);
          if (!isNaN(pageNum) && pageNum >= 1) {
            output = await generateLegalSnippet(
              doc.buffer, 
              {
                pageNumber: pageNum,
                label: key.replace(/_/g, ' ').toUpperCase(),
                color: '#ffeb3b', // Yellow
                // Highlight top area as we don't have bbox yet
                bbox: { x: 0, y: 0, width: 1, height: 0.15 } 
              },
              { format: 'png' } // Try PNG first
            );
          }
        }
        
        // Strategy 2: Text Snippet (Fallback or Word)
        if (!output && quote) {
          const context = findContext(extractedText, quote);
          output = await generateTextSnippet(
            context || quote,
            key.replace(/_/g, ' ').toUpperCase()
          );
        }
        
        if (output) {
          // Upload to Supabase
          const path = `${request.pipelineId}/${doc.filename}/${key}.${output.extension}`;
          
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(path, output.buffer, {
              contentType: output.mimeType,
              upsert: true
            });
          
          if (uploadError) {
            console.warn(`[Snippet Service] Upload failed for ${key}:`, uploadError.message);
          } else {
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from(bucket)
              .getPublicUrl(path);
              
            // Update database
            await supabase.from('legal_term_sources').insert({
              analysis_id: request.analysisId,
              section: 'key_terms',
              term_key: key,
              extracted_value: String(data.value || ''),
              page_number: parseInt(pageNumStr) || 1, // Default to 1 if missing
              snippet_url: publicUrl,
              confidence: 0.9
            });
          }
        }
        
      } catch (err) {
        console.warn(`[Snippet Service] Failed to generate ${key}:`, err);
      }
      
      processed++;
      onProgress?.(processed, totalTerms);
    }
  }
}
