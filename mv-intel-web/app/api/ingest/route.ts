/**
 * Financial Data Ingestion API
 * POST /api/ingest - Process uploaded financial files
 * 
 * Accepts: { companySlug: string, filePaths: string[], notes?: string }
 * Returns: { status, company, summary, results }
 * 
 * @version 3.2.0 - Parallelized extraction pipeline
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { extractFinancialDocument, UnifiedExtractionResult, VarianceExplanation } from '@/lib/financials/ingestion/unified_extractor';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod, saveMetricsToDb } from '@/lib/financials/metrics/compute_metrics';
import { loadCommonMetrics, getMetricById } from '@/lib/financials/metrics/loader';
import { extractPageSnippet, SourceAnnotation } from '@/lib/financials/audit/pdf_snippet';
import { createClient } from '@supabase/supabase-js';
import { reconcileFacts, ReconciliationResult } from '@/lib/financials/ingestion/reconciliation';
import { LocalFactRecord } from '@/lib/financials/local/storage';

// Force dynamic rendering - prevents edge caching issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vercel Pro: maxDuration up to 300s (5 min) by default
// With Fluid Compute enabled: up to 800s (13+ min)
// This allows time for multi-file extraction with LLM calls
export const maxDuration = 300;

// Helper to create Supabase client lazily (inside handler, not at module load time)
// This prevents Vercel build failures when env vars aren't available during build
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in environment variables.'
    );
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Extract period date from filename using pattern matching
 * Supports: Q1-Q4 2024, Jan-Dec 2024, 2024-01, FY2024, etc.
 */
function extractPeriodDateFromFilename(filename: string): string | null {
  const patterns = [
    // Q3 2024, Q3_2024, Q3-2024
    { regex: /Q([1-4])[\s_-]*(\d{4})/i, handler: (m: RegExpMatchArray) => {
      const quarter = parseInt(m[1]);
      const year = parseInt(m[2]);
      const month = (quarter - 1) * 3 + 1;  // Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }},
    // September 2024, Sep 2024, Sept 2024
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
    // 2024-09, 2024_09, 202409
    { regex: /(\d{4})[\s_-]?(\d{2})(?!\d)/i, handler: (m: RegExpMatchArray) => {
      const year = parseInt(m[1]);
      const month = parseInt(m[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }
      return null;
    }},
    // FY2024, FY24
    { regex: /FY[\s_-]?(\d{2,4})/i, handler: (m: RegExpMatchArray) => {
      let year = parseInt(m[1]);
      if (year < 100) year += 2000;  // FY24 -> 2024
      return `${year}-01-01`;  // Fiscal year starts Jan 1 (simplified)
    }},
    // YYYYMMDD (e.g., 20250324) -> Treat as that specific date
    { regex: /(\d{4})(\d{2})(\d{2})/i, handler: (m: RegExpMatchArray) => {
        const year = parseInt(m[1]);
        const month = parseInt(m[2]);
        const day = parseInt(m[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return null;
    }}
  ];

  for (const { regex, handler } of patterns) {
    const match = filename.match(regex);
    if (match) {
      const result = handler(match);
      if (result) {
        console.log(`[Ingest] Extracted period ${result} from filename: ${filename}`);
        return result;
      }
    }
  }

  return null;
}

// Simple concurrency limiter
async function pLimit<T>(concurrency: number, tasks: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length).fill({ status: 'rejected', reason: 'Not executed' });
    const executing = new Set<Promise<void>>();
    
    // Wrapper to handle individual task execution and result tracking
    const runTask = async (task: () => Promise<T>, index: number) => {
        try {
            const value = await task();
            results[index] = { status: 'fulfilled', value };
        } catch (reason) {
            results[index] = { status: 'rejected', reason };
        }
    };

    for (let i = 0; i < tasks.length; i++) {
        const p = Promise.resolve().then(() => runTask(tasks[i], i));
        
        // We use a separate promise for tracking completion in the set
        // ensuring we remove the specific promise reference we added
        const e = p.then(() => {
            executing.delete(e);
        });
        
        executing.add(e);
        
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    
    await Promise.all(executing);
    return results;
}

// Process files from Storage - POST handler for financial data ingestion
// Accepts: { companySlug: string, filePaths: string[], notes?: string }
export async function POST(req: NextRequest) {
  try {
    // Initialize Supabase client inside handler (lazy initialization)
    const supabase = getSupabaseClient();
    
    const json = await req.json();
    const { companySlug: requestedSlug, filePaths, notes, forceCompanyId, dryRun } = json;

    // For dry runs, default to 'nelly' if no company specified (our test case)
    const companySlug = requestedSlug || (dryRun ? 'nelly' : null);

    if (!companySlug || !filePaths || !Array.isArray(filePaths)) {
      return NextResponse.json({ error: 'Missing company or filePaths' }, { status: 400 });
    }

    // Reject empty file arrays - unless notes are provided
    if (filePaths.length === 0 && (!notes || notes.trim().length === 0)) {
      return NextResponse.json({ 
        error: 'No files provided and no notes entered. Please upload a file or enter text to ingest.',
        status: 'error'
      }, { status: 400 });
    }
    
    // Prepare items to process (Storage files + Text input)
    const itemsToProcess = [
        ...filePaths.map((p: string) => ({ type: 'storage', path: p })),
        ...(notes && notes.trim().length > 0 ? [{ type: 'text', content: notes }] : [])
    ];

    console.log(`[Ingest] Starting parallel processing for ${itemsToProcess.length} items for ${companySlug}`);

    // Define the async task for processing a single item
    const processItemTask = async (item: any) => {
        const itemLabel = item.type === 'storage' ? item.path : 'Text Input';
        const filePath = (item.type === 'storage' ? item.path : 'text_input') as string;
        
        console.log(`[Ingest] Processing ${itemLabel} for ${companySlug} (Dry Run: ${!!dryRun})...`);
        
        try {
            // 1. Load File (from Supabase Storage OR Text Input)
            let fileMeta;
            if (item.type === 'storage') {
                fileMeta = await loadFile(item.path as string);
            } else {
                // Construct virtual file from text input
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                fileMeta = {
                    filename: `investor_update_${timestamp}.txt`,
                    buffer: Buffer.from(item.content as string, 'utf-8'),
                    mimeType: 'text/plain',
                    size: Buffer.byteLength(item.content as string)
                };
            }
            
            // 2. Load Guide
            const guide = await loadPortcoGuide(companySlug, supabase);
            const companyName = guide.company_metadata?.name || (guide as any).company?.name;
            if (!companyName) throw new Error(`Invalid guide structure for ${companySlug}: Missing company name`);

            // 2b. Resolve Company ID (Can be cached or parallelized - done per file for safety/retries)
            // ... (keeping resolution logic inside task for robustness, though slightly redundant)
            let companyId: string | null = null;
            try {
                if (forceCompanyId) {
                    const { data: forcedMatch, error: forcedError } = await supabase
                        .schema('graph').from('entities').select('id, name').eq('id', forceCompanyId).single();
                    if (forcedError || !forcedMatch) {
                        if (!dryRun) throw new Error(`Forced company ID ${forceCompanyId} not found.`);
                         companyId = '00000000-0000-0000-0000-000000000000';
                    } else companyId = forcedMatch.id;
                } else {
                     // Step 1: Try exact match
                     const { data: exactMatch } = await supabase
                        .schema('graph').from('entities').select('id, name').eq('type', 'organization').eq('name', companyName).maybeSingle();
                    if (exactMatch) companyId = exactMatch.id;
                    else {
                        // Step 2: Fuzzy match
                        const coreName = companyName.replace(/\s+(GmbH|Inc\.?|LLC|Ltd\.?|Corp\.?|AG|SE|SA|SAS|BV|NV)$/i, '').trim();
                        const firstWord = coreName.split(' ')[0];
                        let candidates: any[] = [];
                        if (firstWord.length > 2) {
                            const { data } = await supabase.schema('graph').from('entities').select('id, name').eq('type', 'organization').ilike('name', `${firstWord}%`).limit(10);
                            if (data) candidates = data;
                        }
                        const matches = candidates.filter(c => c.name.toLowerCase().includes(coreName.toLowerCase()) || companyName.toLowerCase().includes(c.name.toLowerCase()));
                        if (matches.length === 1) companyId = matches[0].id;
                        else if (!dryRun) {
                            return { file: filePath, status: 'company_not_found', error: matches.length > 1 ? `Multiple matches for '${companyName}'` : `Company '${companyName}' not found` };
                        } else companyId = '00000000-0000-0000-0000-000000000000';
                    }
                }
            } catch (err: any) {
                if (!dryRun) throw err;
                companyId = '00000000-0000-0000-0000-000000000000';
            }

            // Register source file
            let sourceFileId = null;
            if (!dryRun) {
                const { data: sourceFile } = await supabase.from('dim_source_files').insert({
                    company_id: companyId, filename: fileMeta.filename, storage_path: filePath, file_type: fileMeta.filename.split('.').pop()?.toLowerCase() || 'unknown'
                }).select().single();
                if (sourceFile) sourceFileId = sourceFile.id;
            }

            // 3. Unified Extraction (Parallel Bottleneck)
            console.log(`[Ingest] Starting unified extraction for ${fileMeta.filename}`);
            const extractedData: UnifiedExtractionResult = await extractFinancialDocument(fileMeta, guide);
            
            // 4. Period Extraction
            const summary = extractedData.financial_summary;
            let periodDate = summary?.period ? extractPeriodDateFromFilename(summary.period) : null;
            if (!periodDate) periodDate = extractPeriodDateFromFilename(fileMeta.filename);
            
            if (!periodDate) throw new Error(`Could not determine reporting period for file '${fileMeta.filename}'`);
            
            const lineItems = await mapDataToSchema(extractedData.fileType, extractedData, guide, fileMeta.filename, periodDate);
            
            // 4b. Snippets & Fact Construction
            const newFactRecords: LocalFactRecord[] = [];
            const uniqueLineItems = new Map<string, { name: string, category: string }>();

             for (const item of lineItems) {
                if (!uniqueLineItems.has(item.line_item_id)) {
                    const commonMetric = getMetricById(item.line_item_id);
                    let name = commonMetric?.name || item.line_item_id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    let category = commonMetric?.category || 'Uncategorized';
                    
                    const guideLineItem = guide.mapping_rules?.line_items?.[item.line_item_id];
                    const guideMetric = (guide as any).metrics_mapping?.[item.line_item_id];
                    if (guideMetric?.labels?.length) { name = guideMetric.labels[0]; category = 'Reported Metric'; }
                    else if (guideLineItem?.label_match) { name = guideLineItem.label_match; category = 'Line Item'; }

                    uniqueLineItems.set(item.line_item_id, { name, category });
                }
            }

            // Upsert Dimensions (Sequential per file is fine, mostly reads)
            if (!dryRun && uniqueLineItems.size > 0) {
                 await supabase.from('dim_line_item').upsert(
                    Array.from(uniqueLineItems.entries()).map(([id, meta]) => ({ id, name: meta.name, category: meta.category })), 
                    { onConflict: 'id' }
                );
            }

            const processedPages = new Set<string>();
            const snippetUrls: Record<string, string> = {};

            for (const item of lineItems) {
                let snippetUrl = undefined;
                if (extractedData.fileType === 'pdf' && item.source_location.page) {
                     const pageNum = item.source_location.page;
                     const snippetKey = `${filePath}_page_${pageNum}`;
                     
                     if (snippetUrls[snippetKey]) snippetUrl = snippetUrls[snippetKey];
                     else if (!processedPages.has(snippetKey)) {
                         try {
                            const pageAnnotations = lineItems.filter(li => li.source_location.page === pageNum && li.source_location.bbox)
                                .map(li => ({ label: li.line_item_id.replace(/_/g, ' ').toUpperCase(), value: li.amount.toLocaleString(), bbox: li.source_location.bbox }));
                            
                            const snippetBuffer = await extractPageSnippet(fileMeta.buffer, pageNum, pageAnnotations.length > 0 ? pageAnnotations : undefined);
                            const safeFilename = fileMeta.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                            const prefix = dryRun ? `_dry_run/${companySlug}` : companySlug;
                            const snippetPath = `${prefix}/${Date.now()}_${safeFilename}_page_${pageNum}.pdf`;
                            
                            await supabase.storage.from('financial-snippets').upload(snippetPath, snippetBuffer, { contentType: 'application/pdf' });
                            const { data: signed } = await supabase.storage.from('financial-snippets').createSignedUrl(snippetPath, 3600);
                            if (signed?.signedUrl) { snippetUrl = signed.signedUrl; snippetUrls[snippetKey] = snippetUrl; }
                         } catch (e) { console.error('Snippet gen failed', e); }
                         processedPages.add(snippetKey);
                     }
                }
                
                newFactRecords.push({
                  line_item_id: item.line_item_id, amount: item.amount, scenario: (item.scenario || 'actual').toLowerCase(),
                  date: item.date || periodDate, source_file: fileMeta.filename, source_location: item.source_location, snippet_url: snippetUrl
                });
            }

            // 4c. Reconcile & Persist
            let finalFacts = newFactRecords;
            let metrics: any[] = [];
            
            if (!dryRun && companyId) {
                // Fetch existing facts
                const datesOfInterest = Array.from(new Set(newFactRecords.map(f => f.date)));
                const { data: existingData } = await supabase.from('fact_financials').select('*, dim_source_files(id, filename)').eq('company_id', companyId).in('date', datesOfInterest);
                
                const existingFacts: LocalFactRecord[] = (existingData || []).map((f: any) => ({
                    line_item_id: f.line_item_id, amount: f.amount, scenario: f.scenario, date: f.date,
                    source_file: f.dim_source_files?.filename || 'unknown', source_location: f.source_location, priority: f.priority,
                    explanation: f.explanation, changelog: f.changelog, snippet_url: f.snippet_url
                }));

                const reconciliation = reconcileFacts(newFactRecords, existingFacts, extractedData.financial_summary?.variance_explanations || []);
                finalFacts = reconciliation.finalFacts;

                if (finalFacts.length > 0) {
                     await supabase.from('fact_financials').upsert(finalFacts.map(fact => ({
                        company_id: companyId, date: fact.date, line_item_id: fact.line_item_id, amount: fact.amount,
                        currency: guide.company_metadata?.currency || (guide as any).company?.currency || 'EUR', scenario: fact.scenario,
                        source_file_id: sourceFileId, source_location: fact.source_location, priority: fact.priority,
                        explanation: fact.explanation, changelog: fact.changelog, snippet_url: fact.snippet_url
                    })), { onConflict: 'company_id,date,scenario,line_item_id' });
                }

                // Compute Metrics
                const factsMap: Record<string, number> = {};
                finalFacts.forEach(item => { if (item.scenario?.toLowerCase() === 'actual') factsMap[item.line_item_id] = item.amount; });
                metrics = computeMetricsForPeriod(companyId, periodDate, factsMap);
                if (metrics.length > 0) await saveMetricsToDb(metrics, companyId, supabase);
            } else if (dryRun) {
                 // For dry run, just compute metrics from new facts
                 const factsMap: Record<string, number> = {};
                 newFactRecords.forEach(item => { if (item.scenario?.toLowerCase() === 'actual') factsMap[item.line_item_id] = item.amount; });
                 metrics = computeMetricsForPeriod(companyId || 'mock', periodDate, factsMap);
            }

            // Cleanup
             if (!dryRun && lineItems.length > 0 && item.type === 'storage') {
                await deleteFile(filePath);
            }

            const status = lineItems.length > 0 ? 'success' : 'needs_review';
            return {
                file: fileMeta.filename, status,
                line_items_found: lineItems.length, metrics_computed: metrics.length, metrics_sample: metrics.slice(0, 3),
                extracted_data: dryRun ? finalFacts : undefined, computed_metrics: dryRun ? metrics : undefined,
                ...(status === 'needs_review' && { warning: 'File parsed successfully but extracted 0 line items.' })
            };

        } catch (err: any) {
            console.error(`Error processing ${filePath}:`, err);
            return { file: filePath, status: 'error', error: err.message || JSON.stringify(err) };
        }
    };

    // EXECUTE IN PARALLEL with limit 5
    // Map items to task functions
    const tasks = itemsToProcess.map(item => () => processItemTask(item));
    const rawResults = await pLimit(5, tasks);
    
    // Unwrap SettledResults
    const results = rawResults.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        const item = itemsToProcess[i];
        const path = item.type === 'storage' ? item.path : 'Input';
        return { file: path, status: 'error', error: `Task Rejected: ${r.reason}` };
    });

    const successCount = results.filter(r => r.status === 'success').length;
    const needsReviewCount = results.filter(r => r.status === 'needs_review').length;
    const errorCount = results.filter(r => r.status === 'error' || r.status === 'company_not_found').length;

    let overallStatus = 'partial';
    if (errorCount === results.length) overallStatus = 'error';
    else if (successCount === results.length) overallStatus = 'success';
    else if (needsReviewCount === results.length) overallStatus = 'needs_review';

    const statusCode = overallStatus === 'error' ? 500 : (overallStatus === 'partial' || overallStatus === 'needs_review' ? 207 : 200);

    return NextResponse.json({
      status: overallStatus, company: companySlug, companyId: companyId, dryRun: !!dryRun,
      summary: { total: results.length, success: successCount, needs_review: needsReviewCount, error: errorCount },
      results
    }, { status: statusCode });

  } catch (error) {
      console.error('Ingestion error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
