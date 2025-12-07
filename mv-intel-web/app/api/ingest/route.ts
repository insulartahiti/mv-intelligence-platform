/**
 * Financial Data Ingestion API
 * POST /api/ingest - Process uploaded financial files
 * 
 * Accepts: { companySlug: string, filePaths: string[], notes?: string }
 * Returns: { status, company, summary, results }
 * 
 * @version 3.1.0 - Unified extraction pipeline (GPT-5.1 + Perplexity + Visual Audit)
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { extractFinancialDocument, UnifiedExtractionResult } from '@/lib/financials/ingestion/unified_extractor';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod, saveMetricsToDb } from '@/lib/financials/metrics/compute_metrics';
import { loadCommonMetrics, getMetricById } from '@/lib/financials/metrics/loader';
import { extractPageSnippet, SourceAnnotation } from '@/lib/financials/audit/pdf_snippet';
import { createClient } from '@supabase/supabase-js';

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

    // Reject empty file arrays - nothing to process
    if (filePaths.length === 0) {
      return NextResponse.json({ 
        error: 'No files provided. Please upload at least one file to ingest.',
        status: 'error'
      }, { status: 400 });
    }

    const results = [];

    for (const filePath of filePaths) {
        console.log(`[Ingest] Processing ${filePath} for ${companySlug} (Dry Run: ${!!dryRun})...`);
        
        try {
            // 1. Load File (from Supabase Storage)
            const fileMeta = await loadFile(filePath);
            
            // 2. Load Guide
            const guide = loadPortcoGuide(companySlug);
            
            // Validate guide structure
            const companyName = guide.company_metadata?.name || (guide as any).company?.name;
            if (!companyName) {
                 throw new Error(`Invalid guide structure for ${companySlug}: Missing company name`);
            }

            // 2b. Resolve Company ID from Knowledge Graph (graph.entities)
            let companyId: string | null = null;

            // If dry run, we can skip strict company resolution or mock it if it fails
            // This allows testing parsing logic even if DB sync is broken
            try {
                // If forced ID is provided (manual override), verify it exists and use it
                if (forceCompanyId) {
                    const { data: forcedMatch, error: forcedError } = await supabase
                        .schema('graph')
                        .from('entities')
                        .select('id, name')
                        .eq('id', forceCompanyId)
                        .single();
                    
                    if (forcedError || !forcedMatch) {
                        if (!dryRun) throw new Error(`Forced company ID ${forceCompanyId} not found in Knowledge Graph.`);
                        console.warn(`[Dry Run] Forced company ID ${forceCompanyId} not found, proceeding with mock ID.`);
                        companyId = '00000000-0000-0000-0000-000000000000';
                    } else {
                        companyId = forcedMatch.id;
                        console.log(`[Ingest] Using forced company ID: ${companyId} (${forcedMatch.name})`);
                    }
                } else {
                    // Strategy: Try exact match first, then fuzzy match (ILIKE) as fallback
                    // ... (existing resolution logic) ...
                    
                    // Step 1: Try exact match
                    const { data: exactMatch, error: exactError } = await supabase
                        .schema('graph')
                        .from('entities')
                        .select('id, name')
                        .eq('type', 'organization')
                        .eq('name', companyName)
                        .maybeSingle();
                    
                    if (exactMatch) {
                        companyId = exactMatch.id;
                        console.log(`[Ingest] Found exact company match: ${exactMatch.name}`);
                    } else {
                        // Step 2: Try fuzzy match
                        const coreName = companyName
                            .replace(/\s+(GmbH|Inc\.?|LLC|Ltd\.?|Corp\.?|AG|SE|SA|SAS|BV|NV)$/i, '')
                            .trim();
                        
                        const firstWord = coreName.split(' ')[0];
                        
                        console.log(`[Ingest] No exact match for '${companyName}', trying fuzzy match with '${coreName}'...`);
                        
                        let candidates: any[] = [];
                        
                        if (firstWord.length > 2) {
                            const { data, error } = await supabase
                                .schema('graph')
                                .from('entities')
                                .select('id, name')
                                .eq('type', 'organization')
                                .ilike('name', `${firstWord}%`)
                                .limit(10);
                                
                            if (!error && data) {
                                candidates = data;
                            }
                        }
                        
                        const matches = candidates.filter(c => {
                            const dbName = c.name.toLowerCase();
                            const guideNameLower = companyName.toLowerCase();
                            const coreNameLower = coreName.toLowerCase();
                            if (guideNameLower.includes(dbName)) return true;
                            if (dbName.includes(coreNameLower)) return true;
                            return false;
                        });
                        
                        if (matches.length === 1) {
                            companyId = matches[0].id;
                            console.log(`[Ingest] Found fuzzy company match: '${matches[0].name}'`);
                        } else if (matches.length > 1) {
                            if (dryRun) {
                                console.warn(`[Dry Run] Ambiguous company match, proceeding with mock ID.`);
                                companyId = '00000000-0000-0000-0000-000000000000';
                            } else {
                                results.push({
                                    file: filePath,
                                    status: 'company_not_found',
                                    error: `Multiple companies match '${companyName}'`,
                                    candidates: matches
                                });
                                continue;
                            }
                        } else {
                            if (dryRun) {
                                console.warn(`[Dry Run] Company not found, proceeding with mock ID.`);
                                companyId = '00000000-0000-0000-0000-000000000000';
                            } else {
                                results.push({
                                    file: filePath,
                                    status: 'company_not_found',
                                    error: `Company '${companyName}' not found in Knowledge Graph`,
                                    candidates: candidates 
                                });
                                continue;
                            }
                        }
                    }
                }
            } catch (resError) {
                if (dryRun) {
                    console.warn(`[Dry Run] Resolution error ignored:`, resError);
                    companyId = '00000000-0000-0000-0000-000000000000';
                } else {
                    throw resError;
                }
            }
            
            // 3. Parse & Map
            // ... (existing parse logic) ...
            
            // Register source file in DB (SKIP IF DRY RUN)
            let sourceFileId = null;
            if (!dryRun) {
                const { data: sourceFile, error: sourceFileError } = await supabase
                    .from('dim_source_files')
                    .insert({
                        company_id: companyId,
                        filename: fileMeta.filename,
                        storage_path: filePath,
                        file_type: fileMeta.filename.split('.').pop()?.toLowerCase() || 'unknown'
                    })
                    .select()
                    .single();

                if (sourceFileError) {
                    console.error('Error creating source file record:', sourceFileError);
                } else {
                    sourceFileId = sourceFile.id;
                }
            } else {
                console.log(`[Dry Run] Skipping dim_source_files insert`);
            }

            // 3. Unified Extraction (GPT-5.1 Vision + Perplexity) - pass guide for context
            console.log(`[Ingest] Starting unified extraction for ${fileMeta.filename}`);
            const extractedData: UnifiedExtractionResult = await extractFinancialDocument(fileMeta, guide);
            const fileType = extractedData.fileType;
            
            console.log(`[Ingest] Extraction complete: ${extractedData.pageCount} pages, ${Object.keys(extractedData.financial_summary?.key_metrics || {}).length} metrics`);
            if (extractedData.benchmarks) {
                console.log(`[Ingest] Perplexity benchmarks: ${Object.keys(extractedData.benchmarks.industry_benchmarks || {}).length} comparisons`);
            }

            // 4. Extract period date
            // Priority: 1) GPT-5.1 financial_summary (from document content)
            //           2) Filename patterns (fallback)
            const summary = extractedData.financial_summary;
            let periodDate: string | null = null;
            let periodType = summary?.period_type || 'month';
            
            // Try GPT-5.1 extracted period first (from document content)
            if (summary?.period) {
                periodDate = extractPeriodDateFromFilename(summary.period);
                if (periodDate) {
                    console.log(`[Ingest] Period from document: ${summary.period} → ${periodDate} (${periodType})`);
                }
            }
            
            // Fallback to filename
            if (!periodDate) {
                periodDate = extractPeriodDateFromFilename(fileMeta.filename);
                if (periodDate) {
                    console.log(`[Ingest] Period from filename: ${periodDate}`);
                }
            }
            
            if (!periodDate) {
                console.error(`[Ingest] CRITICAL: Could not determine reporting period for ${fileMeta.filename}`);
                throw new Error(
                    `Could not determine reporting period for file '${fileMeta.filename}'. ` +
                    `Ensure the document or filename contains a date (e.g., "Q3 2025", "September 2025").`
                );
            }
            
            const lineItems = await mapDataToSchema(fileType, extractedData, guide, fileMeta.filename, periodDate);
            
            // 4b. Generate Audit Snippets & Prepare Fact Rows
            const processedPages = new Set<string>(); 
            const snippetUrls: Record<string, string> = {}; // Cache page -> URL mapping
            const factRows: any[] = [];
            const uniqueLineItems = new Map<string, { name: string, category: string }>();

            // Collect unique line items
            for (const item of lineItems) {
                if (!uniqueLineItems.has(item.line_item_id)) {
                    const commonMetric = getMetricById(item.line_item_id);
                    let name = item.line_item_id;
                    let category = 'Uncategorized';

                    if (commonMetric) {
                        name = commonMetric.name;
                        category = commonMetric.category;
                    } else {
                        const guideLineItem = guide.mapping_rules?.line_items?.[item.line_item_id];
                        const guideMetric = (guide as any).metrics_mapping?.[item.line_item_id];

                        if (guideMetric && guideMetric.labels && guideMetric.labels.length > 0) {
                            name = guideMetric.labels[0];
                            category = 'Reported Metric';
                        } else if (guideLineItem && guideLineItem.label_match) {
                            name = guideLineItem.label_match;
                            category = 'Line Item';
                        } else {
                            name = item.line_item_id
                                .split('_')
                                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(' ');
                        }
                    }
                    uniqueLineItems.set(item.line_item_id, { name, category });
                }
            }

            // Upsert Dimensions (SKIP IF DRY RUN)
            if (!dryRun && uniqueLineItems.size > 0) {
                const dimRows = Array.from(uniqueLineItems.entries()).map(([id, meta]) => ({
                    id,
                    name: meta.name,
                    category: meta.category
                }));

                const { error: dimError } = await supabase
                    .from('dim_line_item')
                    .upsert(dimRows, { onConflict: 'id' });

                if (dimError) {
                    console.error('Error upserting dim_line_item:', dimError);
                }
            } else if (dryRun) {
                console.log(`[Dry Run] Skipping dim_line_item upsert (${uniqueLineItems.size} items)`);
            }

            for (const item of lineItems) {
                const factRow: any = {
                    company_id: companyId,
                    date: item.date || periodDate,
                    line_item_id: item.line_item_id,
                    amount: item.amount,
                    currency: guide.company_metadata?.currency || (guide as any).company?.currency || 'EUR',
                    scenario: item.scenario || 'Actual', // Actual, Budget, or Forecast
                    source_file_id: sourceFileId,
                    source_location: item.source_location
                };

                // Generate audit snippets for PDFs with visual highlighting (both live and dry run)
                if (fileType === 'pdf' && item.source_location.page) {
                    const pageNum = item.source_location.page;
                    const snippetKey = `${filePath}_page_${pageNum}`;
                    
                    // Check cache first
                    if (snippetUrls[snippetKey]) {
                        factRow.snippet_url = snippetUrls[snippetKey];
                    } else if (!processedPages.has(snippetKey)) {
                        console.log(`[Ingest] Generating audit snippet for ${fileMeta.filename} page ${pageNum}...`);
                        try {
                            // Collect all annotations for this page (metrics with bboxes)
                            const pageAnnotations: SourceAnnotation[] = lineItems
                                .filter(li => li.source_location.page === pageNum && li.source_location.bbox)
                                .map(li => ({
                                    label: li.line_item_id.replace(/_/g, ' ').toUpperCase(),
                                    value: li.amount.toLocaleString(),
                                    bbox: li.source_location.bbox
                                }));
                            
                            console.log(`[Ingest] Adding ${pageAnnotations.length} highlight annotations to page ${pageNum}`);
                            
                            // Generate snippet with visual highlights
                            const snippetBuffer = await extractPageSnippet(
                                fileMeta.buffer, 
                                pageNum,
                                pageAnnotations.length > 0 ? pageAnnotations : undefined
                            );
                            
                            const safeFilename = fileMeta.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                            // Use temp prefix for dry runs to distinguish from production snippets
                            const prefix = dryRun ? `_dry_run/${companySlug}` : companySlug;
                            const snippetPath = `${prefix}/${Date.now()}_${safeFilename}_page_${pageNum}.pdf`;
                            
                            const { error: uploadError } = await supabase.storage
                                .from('financial-snippets')
                                .upload(snippetPath, snippetBuffer, { contentType: 'application/pdf' });
                                
                            if (uploadError) {
                                console.error('Failed to upload snippet:', uploadError);
                            } else {
                                // Generate signed URL for viewing (1 hour validity)
                                const { data: signedData } = await supabase.storage
                                    .from('financial-snippets')
                                    .createSignedUrl(snippetPath, 3600);
                                    
                                if (signedData?.signedUrl) {
                                    snippetUrls[snippetKey] = signedData.signedUrl;
                                    factRow.snippet_url = signedData.signedUrl;
                                }
                            }
                        } catch (err) {
                            console.error(`Failed to generate/upload snippet for page ${pageNum}`, err);
                        } finally {
                            processedPages.add(snippetKey);
                        }
                    }
                }
                
                factRows.push(factRow);
            }

            // 4c. Persist Raw Facts (SKIP IF DRY RUN)
            if (!dryRun && factRows.length > 0) {
                const { error: factsError } = await supabase
                    .from('fact_financials')
                    .insert(factRows);
                
                if (factsError) {
                    console.error('Error persisting fact_financials:', factsError);
                    throw new Error('Failed to save financial data to database');
                }
            } else if (dryRun) {
                console.log(`[Dry Run] Skipping fact_financials insert (${factRows.length} rows)`);
            }

            // 5. Compute Metrics (only from Actuals, not Budget)
            const facts: Record<string, number> = {};
            
            lineItems.forEach(item => {
                // Only include Actuals in metric computation (Budget is stored but not used for derived metrics)
                if (item.scenario && item.scenario !== 'actual') {
                    return; // Skip budget/forecast items
                }
                
                // Deduplicate: use latest value instead of summing (prevents double-counting)
                facts[item.line_item_id] = item.amount;
            });
            
            // Use mock ID for metrics computation if company not resolved (dry run)
            const metricsCompanyId = companyId || '00000000-0000-0000-0000-000000000000';
            const metrics = computeMetricsForPeriod(metricsCompanyId, periodDate, facts);
            
            // 5b. Persist Metrics (SKIP IF DRY RUN)
            if (!dryRun && metrics.length > 0 && companyId) {
                await saveMetricsToDb(metrics, companyId, supabase);
            } else if (dryRun) {
                console.log(`[Dry Run] Skipping fact_metrics insert (${metrics.length} rows)`);
            }

            const extractionStatus = lineItems.length > 0 ? 'success' : 'needs_review';
            
            results.push({
                file: fileMeta.filename,
                line_items_found: lineItems.length,
                metrics_computed: metrics.length,
                metrics_sample: metrics.slice(0, 3),
                // Return full data in dry run for preview
                extracted_data: dryRun ? factRows : undefined,
                computed_metrics: dryRun ? metrics : undefined,
                status: extractionStatus,
                ...(extractionStatus === 'needs_review' && {
                    warning: 'File parsed successfully but extracted 0 line items. Check guide mapping rules.'
                })
            });

            // 6. Cleanup
            if (!dryRun && lineItems.length > 0) {
                console.log(`[Ingest] Deleting ${filePath} from storage (successful extraction)...`);
                await deleteFile(filePath);
            } else {
                console.log(`[Ingest] Retaining ${filePath} (Dry Run or Issue)`);
            }

        } catch (fileError: any) {
            // ... (error handling) ...
            console.error(`Error processing file ${filePath}:`, fileError);
            const errorMessage = fileError?.message || (typeof fileError === 'string' ? fileError : JSON.stringify(fileError));
            results.push({
                file: filePath,
                status: 'error',
                error: errorMessage
            });
        }
    }
    
    // ... (status calculation) ...
    const successCount = results.filter(r => r.status === 'success').length;
    const needsReviewCount = results.filter(r => r.status === 'needs_review').length;
    const errorCount = results.filter(r => r.status === 'error' || r.status === 'company_not_found').length; // Treat company_not_found as error in summary

    let overallStatus: string;
    if (errorCount === results.length) overallStatus = 'error';
    else if (successCount === results.length) overallStatus = 'success';
    else if (needsReviewCount === results.length) overallStatus = 'needs_review';
    else overallStatus = 'partial';

    return NextResponse.json({
      status: overallStatus,
      company: companySlug,
      dryRun: !!dryRun,
      summary: {
        total: results.length,
        success: successCount,
        needs_review: needsReviewCount,
        error: errorCount
      },
      results
    }, { status: overallStatus === 'error' ? 500 : 200 }); // 200 for dry run usually

  } catch (error) {
      // ...
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

// Note: Company detection has been moved to /api/detect-company for cleaner separation of concerns
