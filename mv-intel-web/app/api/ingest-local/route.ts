/**
 * Local Development Ingestion API
 * POST /api/ingest-local - Process files with local caching
 * 
 * This endpoint:
 * 1. Checks cache before calling OpenAI
 * 2. Stores results locally instead of Supabase
 * 3. Enables fast iteration and comparison
 * 
 * Use this during development to avoid API costs and database writes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';
import { loadFile } from '@/lib/financials/ingestion/load_file';
import { extractFinancialDocument, UnifiedExtractionResult, VarianceExplanation } from '@/lib/financials/ingestion/unified_extractor';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod } from '@/lib/financials/metrics/compute_metrics';
import { getMetricById } from '@/lib/financials/metrics/loader';
import { extractPageSnippet } from '@/lib/financials/audit/pdf_snippet';
import { generatePageSnippet, isRenderingAvailable } from '@/lib/financials/audit/screenshot_snippet';
import { generateExcelSnippetImage } from '@/lib/financials/audit/excel_snippet';
import { reconcileFacts, getFilePriority, detectFileType, ChangeLogEntry, ConflictEntry } from '@/lib/financials/ingestion/reconciliation';
import {
  hashFileContent,
  getCachedExtraction,
  setCachedExtraction,
  saveExtractionResult,
  saveSnippet,
  loadLatestExtraction,
  saveFacts,
  loadFacts,
  saveMetrics,
  compareExtractions,
  getLocalDataSummary,
  LocalFactRecord,
  LocalMetricRecord
} from '@/lib/financials/local/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vercel Pro: maxDuration up to 300s (5 min) by default
// With Fluid Compute enabled: up to 800s (13+ min)
// This allows time for multi-file extraction with LLM calls
export const maxDuration = 300;

/**
 * Extract period date from filename using pattern matching
 */
function extractPeriodDateFromFilename(filename: string): string | null {
  const patterns = [
    { regex: /(\d{4})[\s_-]*Annual[\s_-]*Budget/i, handler: (m: RegExpMatchArray) => {
      // Annual Budget YYYY -> YYYY-01-01
      const year = parseInt(m[1]);
      return `${year}-01-01`;
    }},
    { regex: /Budget[\s_-]*(\d{4})/i, handler: (m: RegExpMatchArray) => {
      // Budget YYYY -> YYYY-01-01
      const year = parseInt(m[1]);
      return `${year}-01-01`;
    }},
    { regex: /Q([1-4])[\s_-]*(\d{4})/i, handler: (m: RegExpMatchArray) => {
      const quarter = parseInt(m[1]);
      const year = parseInt(m[2]);
      const month = (quarter - 1) * 3 + 1;
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }},
    { regex: /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s_-]*(\d{4})/i, handler: (m: RegExpMatchArray) => {
      const monthNames: Record<string, number> = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, sept: 9, september: 9,
        oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
      };
      const monthKey = m[1].toLowerCase().slice(0, 3);
      const month = monthNames[monthKey] || monthNames[m[1].toLowerCase()];
      const year = parseInt(m[2]);
      return month ? `${year}-${String(month).padStart(2, '0')}-01` : null;
    }},
    { regex: /(\d{4})[\s_-]?(\d{2})(?!\d)/i, handler: (m: RegExpMatchArray) => {
      const year = parseInt(m[1]);
      const month = parseInt(m[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }
      return null;
    }},
    { regex: /(\d{4})(\d{2})(\d{2})/i, handler: (m: RegExpMatchArray) => {
      // YYYYMMDD
      const year = parseInt(m[1]);
      const month = parseInt(m[2]);
      const day = parseInt(m[3]);
      
      // Basic validation: year 2000-2099, month 1-12, day 1-31
      if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        // If it looks like a full date, use the month from it
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }
      return null;
    }},
    { regex: /FY[\s_-]?(\d{2,4})/i, handler: (m: RegExpMatchArray) => {
      let year = parseInt(m[1]);
      if (year < 100) year += 2000;
      return `${year}-01-01`;
    }}
  ];

  for (const { regex, handler } of patterns) {
    const match = filename.match(regex);
    if (match) {
      const result = handler(match);
      if (result) return result;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { companySlug: requestedSlug, filePaths, useCache = true, forceReextract = false } = json;
    
    const companySlug = requestedSlug || 'nelly';
    
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    
    // Check if screenshot rendering is available (GraphicsMagick)
    const canRenderScreenshots = await isRenderingAvailable();
    console.log(`[Local Ingest] Screenshot rendering available: ${canRenderScreenshots}`);
    
    // Initialize Supabase client for guide loading (if credentials exist)
    let supabase;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }

    // Load guide once (shared across all files)
    const guide = await loadPortcoGuide(companySlug, supabase);
    
    // =========================================================================
    // PARALLEL EXTRACTION: Process all files concurrently
    // =========================================================================
    console.log(`[Local Ingest] Starting PARALLEL extraction of ${filePaths.length} files...`);
    const startTime = Date.now();
    
    const extractionPromises = filePaths.map(async (filePath) => {
      console.log(`[Local Ingest] Processing ${filePath} for ${companySlug}...`);
      
      try {
        // 1. Load File
        const fileMeta = await loadFile(filePath);
        const fileHash = hashFileContent(fileMeta.buffer);
        
        // 2. Check cache (unless forceReextract)
        let extractedData: UnifiedExtractionResult;
        let usedCache = false;
        
        if (useCache && !forceReextract) {
          const cached = getCachedExtraction(fileHash);
          if (cached) {
            console.log(`[Local Ingest] Using cached extraction for ${fileMeta.filename}`);
            extractedData = cached.response;
            usedCache = true;
          }
        }
        
        // 3. Extract if not cached
        if (!usedCache) {
          console.log(`[Local Ingest] Running extraction for ${fileMeta.filename}...`);
          extractedData = await extractFinancialDocument(fileMeta, guide);
          
          // Cache the result
          if (useCache) {
            setCachedExtraction(fileHash, fileMeta.filename, extractedData);
          }
        }
        
        return { fileMeta, fileHash, extractedData, usedCache, error: null };
      } catch (error: any) {
        console.error(`[Local Ingest] Extraction failed for ${filePath}:`, error);
        return { filePath, error: error.message, usedCache: false };
      }
    });
    
    // Wait for all extractions to complete
    const extractionResults = await Promise.all(extractionPromises);
    console.log(`[Local Ingest] All extractions complete in ${Date.now() - startTime}ms`);
    
    // =========================================================================
    // SEQUENTIAL POST-PROCESSING: Map, reconcile, generate snippets
    // =========================================================================
    const results = [];
    
    for (const extraction of extractionResults) {
      if (extraction.error || !extraction.fileMeta) {
        results.push({
          file: extraction.filePath || 'unknown',
          status: 'error',
          error: extraction.error
        });
        continue;
      }
      
      const { fileMeta, fileHash, extractedData, usedCache } = extraction;
      
      try {
        // 4. Extract period
        const summary = extractedData.financial_summary;
        let periodDate: string | null = null;
        
        if (summary?.period) {
          periodDate = extractPeriodDateFromFilename(summary.period);
        }
        if (!periodDate) {
          periodDate = extractPeriodDateFromFilename(fileMeta.filename);
        }
        if (!periodDate) {
          periodDate = new Date().toISOString().slice(0, 10);
          console.warn(`[Local Ingest] Could not determine period, using today: ${periodDate}`);
        }
        
        // 5. Map to schema
        const lineItems = await mapDataToSchema(
          extractedData.fileType,
          extractedData,
          guide,
          fileMeta.filename,
          periodDate
        );
        
        // 6. Generate Audit Snippets (Screenshot-based for better quality)
        const processedPages = new Set<string>(); 
        const snippetUrls: Record<string, string> = {};
        
        if (extractedData.fileType === 'pdf') {
            for (const item of lineItems) {
                if (item.source_location?.page) {
                    const pageNum = item.source_location.page;
                    const snippetKey = `${fileMeta.filename}-p${pageNum}`;
                    
                    if (!processedPages.has(snippetKey)) {
                        console.log(`[Local Ingest] Generating snippet for page ${pageNum}`);
                        try {
                            // Collect all annotations for this page
                            const pageItems = lineItems.filter(i => i.source_location?.page === pageNum);
                            const annotations = pageItems.map(i => ({
                                label: i.line_item_id,
                                value: i.amount.toString(),
                                bbox: i.source_location?.bbox
                            }));

                            let snippetBuffer: Buffer;
                            
                            // Try screenshot rendering first (higher quality)
                            if (canRenderScreenshots) {
                                try {
                                    snippetBuffer = await generatePageSnippet(
                                        fileMeta.buffer,
                                        pageNum,
                                        annotations,
                                        { scale: 2, maxWidth: 1400 }
                                    );
                                } catch (screenshotErr) {
                                    console.warn(`[Local Ingest] Screenshot failed, falling back to PDF: ${screenshotErr}`);
                                    snippetBuffer = await extractPageSnippet(fileMeta.buffer, pageNum, annotations);
                                }
                            } else {
                                // Fallback to PDF-based snippets
                                snippetBuffer = await extractPageSnippet(fileMeta.buffer, pageNum, annotations);
                            }
                            
                            // Save locally
                            const snippetFilename = `${fileMeta.filename.replace('.pdf', '')}_p${pageNum}.png`;
                            const localUrl = saveSnippet(companySlug, snippetFilename, snippetBuffer);
                            
                            snippetUrls[pageNum] = localUrl;
                            processedPages.add(snippetKey);
                        } catch (err) {
                            console.error(`[Local Ingest] Failed to generate snippet for page ${pageNum}:`, err);
                        }
                    }
                    
                    // Assign snippet URL to line item if available
                    if (snippetUrls[pageNum]) {
                        (item as any).snippet_url = snippetUrls[pageNum];
                    }
                }
            }
        } else if (extractedData.fileType === 'xlsx') {
            // EXCEL SNIPPETS
            // Re-parse workbook from buffer (since extractedData only has data arrays)
            let workbook: XLSX.WorkBook | null = null;
            try {
                workbook = XLSX.read(fileMeta.buffer, { type: 'buffer' });
            } catch (wbErr) {
                console.warn(`[Local Ingest] Failed to reload workbook for snippets: ${wbErr}`);
            }

            if (workbook) {
                for (const item of lineItems) {
                    if (item.source_location?.sheet && item.source_location?.cell) {
                        const { sheet, cell } = item.source_location;
                        const snippetKey = `${fileMeta.filename}-${sheet}-${cell}`;
                        
                        if (!processedPages.has(snippetKey)) {
                            console.log(`[Local Ingest] Generating Excel snippet for ${sheet}!${cell}`);
                            try {
                                const snippetBuffer = await generateExcelSnippetImage(workbook, sheet, cell);
                                
                                // Save locally
                                const snippetFilename = `${fileMeta.filename.replace(/\.xlsx?$/i, '')}_${sheet.replace(/[^a-z0-9]/gi, '_')}_${cell}.png`;
                                const localUrl = saveSnippet(companySlug, snippetFilename, snippetBuffer);
                                
                                snippetUrls[snippetKey] = localUrl;
                                processedPages.add(snippetKey);
                            } catch (err) {
                                console.error(`[Local Ingest] Failed to generate Excel snippet for ${sheet}!${cell}:`, err);
                            }
                        }
                        
                        if (snippetUrls[snippetKey]) {
                            (item as any).snippet_url = snippetUrls[snippetKey];
                        }
                    }
                }
            }
        }
        
        // 7. Compute metrics (only from Actuals)
        const facts: Record<string, number> = {};
        lineItems.forEach(item => {
          if (item.scenario && item.scenario.toLowerCase() !== 'actual') return;
          facts[item.line_item_id] = item.amount;
        });
        
        const computedMetrics = computeMetricsForPeriod(
          '00000000-0000-0000-0000-000000000000', // Mock ID for local
          periodDate,
          facts
        );
        
        // 8. Reconciliation - Compare with existing data
        const existingFacts = loadFacts(companySlug, periodDate);
        
        // Build new fact records
        const newFactRecords: LocalFactRecord[] = lineItems.map(item => ({
          line_item_id: item.line_item_id,
          amount: item.amount,
          scenario: (item.scenario || 'actual').toLowerCase(),
          date: item.date || periodDate,
          source_file: fileMeta.filename,
          source_location: item.source_location,
          extractedAt: new Date().toISOString(),
          snippet_url: (item as any).snippet_url
        }));
        
        // Get variance explanations from extraction
        const varianceExplanations: VarianceExplanation[] = 
          extractedData.financial_summary?.variance_explanations || [];
        
        // Run reconciliation
        const reconciliationResult = reconcileFacts(
          newFactRecords,
          existingFacts,
          varianceExplanations
        );
        
        console.log(`[Local Ingest] Reconciliation: ${reconciliationResult.summary.inserted} inserted, ${reconciliationResult.summary.updated} updated, ${reconciliationResult.summary.ignored} ignored, ${reconciliationResult.summary.conflicts} conflicts`);
        
        // Save facts (Grouped by period to ensure correct storage)
        const factsByPeriod: Record<string, LocalFactRecord[]> = {};
        
        for (const fact of reconciliationResult.finalFacts) {
            const p = fact.date || periodDate;
            if (!factsByPeriod[p]) factsByPeriod[p] = [];
            factsByPeriod[p].push(fact);
        }

        // Save each period's facts to its own file
        for (const [p, facts] of Object.entries(factsByPeriod)) {
            saveFacts(companySlug, p, facts);
        }
        
        // Save extraction result
        const savedPath = saveExtractionResult(
          companySlug,
          fileMeta.filename,
          fileHash,
          extractedData,
          lineItems,
          computedMetrics
        );
        
        // Save metrics
        const metricRecords: LocalMetricRecord[] = computedMetrics.map(m => ({
          metric_id: m.metric_id,
          value: m.value,
          unit: getMetricById(m.metric_id)?.unit || 'unknown',
          period: m.period,
          inputs: m.inputs,
          calculatedAt: new Date().toISOString()
        }));
        saveMetrics(companySlug, periodDate, metricRecords);
        
        // 9. Compare with previous extraction (if exists)
        let diff = null;
        const previousExtraction = loadLatestExtraction(companySlug, fileMeta.filename);
        if (previousExtraction && previousExtraction.extractedAt !== new Date().toISOString().slice(0, 19)) {
          diff = compareExtractions(previousExtraction, {
            filename: fileMeta.filename,
            companySlug,
            extractedAt: new Date().toISOString(),
            fileHash,
            result: extractedData,
            lineItems,
            computedMetrics
          });
        }
        
        results.push({
          file: fileMeta.filename,
          fileType: detectFileType(fileMeta.filename),
          priority: getFilePriority(fileMeta.filename, 'actual'),
          status: lineItems.length > 0 ? 'success' : 'needs_review',
          usedCache,
          savedPath,
          period: periodDate,
          line_items_found: lineItems.length,
          metrics_computed: computedMetrics.length,
          // Reconciliation results
          reconciliation: {
            summary: reconciliationResult.summary,
            changes: reconciliationResult.changes,
            conflicts: reconciliationResult.conflicts
          },
          // Extracted data with changelog info
          extracted_data: reconciliationResult.finalFacts
            .filter(f => f.source_file === fileMeta.filename) // Only show facts from this file
            .map(item => ({
              line_item_id: item.line_item_id,
              amount: item.amount,
              scenario: item.scenario || 'actual',
              date: item.date, // Pass specific date for time series support
              source_location: item.source_location,
              snippet_url: item.snippet_url,
              explanation: item.explanation,
              hasChangelog: (item.changelog?.length || 0) > 1, // More than initial import
              changelog: item.changelog
            })),
          computed_metrics: computedMetrics.map(m => ({
            metric_id: m.metric_id,
            value: m.value,
            unit: getMetricById(m.metric_id)?.unit || 'unknown',
            period: m.period
          })),
          variance_explanations: varianceExplanations,
          diff: diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) ? diff : null
        });
        
      } catch (fileError: any) {
        console.error(`[Local Ingest] Error processing ${filePath}:`, fileError);
        results.push({
          file: filePath,
          status: 'error',
          error: fileError.message
        });
      }
    }
    
    // Summary
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const localSummary = getLocalDataSummary();
    
    return NextResponse.json({
      status: errorCount === results.length ? 'error' : successCount === results.length ? 'success' : 'partial',
      mode: 'local',
      company: companySlug,
      guide_used: guide, // Return full guide for UI display
      summary: {
        total: results.length,
        success: successCount,
        error: errorCount,
        cached: results.filter(r => r.usedCache).length
      },
      local_storage: localSummary,
      results
    });
    
  } catch (error: any) {
    console.error('[Local Ingest] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to view local data summary
export async function GET() {
  const summary = getLocalDataSummary();
  return NextResponse.json({
    mode: 'local',
    ...summary
  });
}

