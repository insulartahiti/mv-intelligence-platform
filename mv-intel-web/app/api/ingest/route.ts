/**
 * Financial Data Ingestion API
 * POST /api/ingest - Process uploaded financial files
 * 
 * Accepts: { companySlug: string, filePaths: string[], notes?: string }
 * Returns: { status, company, summary, results }
 * 
 * @version 2.1.0 - Added needs_review status for zero-extraction files
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { parsePDF } from '@/lib/financials/ingestion/parse_pdf';
import { parseExcel } from '@/lib/financials/ingestion/parse_excel';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod, saveMetricsToDb } from '@/lib/financials/metrics/compute_metrics';
import { loadCommonMetrics, getMetricById } from '@/lib/financials/metrics/loader';
import { extractPageSnippet } from '@/lib/financials/audit/pdf_snippet';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering - prevents edge caching issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const { companySlug, filePaths, notes } = json;

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
        console.log(`[Ingest] Processing ${filePath} for ${companySlug}...`);
        
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

            // 2b. Resolve Company ID from Database
            // Use exact match (eq) instead of ilike to avoid ambiguous matches
            const { data: companyData, error: companyError } = await supabase
                .from('companies')
                .select('id')
                .eq('name', companyName)
                .single();

            // Handle specific error codes:
            // PGRST116 = No rows found
            // PGRST122 = Multiple rows found (ambiguous match)
            if (companyError) {
                if (companyError.code === 'PGRST116') {
                    console.error(`[Ingest] Error: Company '${companyName}' not found in DB.`);
                    throw new Error(`Company '${companyName}' not found in database. Please ensure the company exists before ingesting.`);
                } else if (companyError.code === 'PGRST122') {
                    console.error(`[Ingest] Error: Multiple companies match '${companyName}'. Name is ambiguous.`);
                    throw new Error(`Multiple companies match '${companyName}'. Please use a more specific company name in the guide.`);
                } else {
                    console.error('Database error looking up company:', companyError);
                    throw new Error(`Database error looking up company: ${companyError.message}`);
                }
            }

            if (!companyData?.id) {
                console.error(`[Ingest] Error: Company '${companyName}' not found in DB.`);
                throw new Error(`Company '${companyName}' not found in database. Please ensure the company exists before ingesting.`);
            }
            const companyId = companyData.id;
            
            // 3. Parse & Map
            // Register source file in DB
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
                // Continue but without linking to source file ID
            }
            const sourceFileId = sourceFile?.id;

            let extractedData;
            let fileType: 'pdf' | 'xlsx' = 'pdf';
            
            // Case-insensitive extension matching
            const filenameLower = fileMeta.filename.toLowerCase();
            if (filenameLower.endsWith('.pdf')) {
                extractedData = await parsePDF(fileMeta);
                fileType = 'pdf';
            } else if (filenameLower.endsWith('.xlsx') || filenameLower.endsWith('.xls')) {
                extractedData = await parseExcel(fileMeta);
                fileType = 'xlsx';
            } else {
                throw new Error(`Unsupported file type: ${fileMeta.filename}. Supported: .pdf, .xlsx, .xls`);
            }

            // 4. Extract period date using heuristic (or fallback to LLM)
            let periodDate = extractPeriodDateFromFilename(fileMeta.filename);
            let periodType = 'month';
            
            // If filename parsing failed, try LLM extraction from content
            if (!periodDate) {
                const contentPreview = fileType === 'pdf' 
                    ? (extractedData as any).fullText?.slice(0, 1000) || ''
                    : JSON.stringify((extractedData as any)[0]?.data?.slice(0, 5) || []);
                
                try {
                    const { extractPeriodFromDocument } = await import('@/lib/financials/extraction/llm_extractor');
                    const extracted = await extractPeriodFromDocument(fileMeta.filename, contentPreview);
                    if (extracted.period_date) {
                        periodDate = extracted.period_date;
                        periodType = extracted.period_type !== 'unknown' ? extracted.period_type : 'month';
                        console.log(`[Ingest] LLM extracted period: ${periodDate} (${periodType})`);
                    }
                } catch (llmErr) {
                    console.warn('[Ingest] LLM period extraction failed, using fallback:', llmErr);
                }
            }
            
            // Final fallback: FAIL instead of using current date
            // Using current date would silently corrupt temporal accuracy of financial records
            if (!periodDate) {
                console.error(`[Ingest] CRITICAL: Could not determine reporting period for ${fileMeta.filename}`);
                throw new Error(
                    `Could not determine reporting period for file '${fileMeta.filename}'. ` +
                    `Please rename the file to include a date (e.g., 'Company_Q3_2024.pdf' or 'Company_Sep_2024.xlsx') ` +
                    `or ensure the document contains clear date references.`
                );
            }
            
            const lineItems = await mapDataToSchema(fileType, extractedData, guide, fileMeta.filename, periodDate);
            
            // 4b. Generate Audit Snippets & Prepare Fact Rows
            const processedPages = new Set<string>(); // Tracks file+page combos to avoid duplicate snippets
            const factRows = [];
            const uniqueLineItems = new Map<string, { name: string, category: string }>();

            // Collect unique line items for dimension upsert
            for (const item of lineItems) {
                if (!uniqueLineItems.has(item.line_item_id)) {
                    // Try to find definition in Common Metrics first
                    const commonMetric = getMetricById(item.line_item_id);
                    let name = item.line_item_id;
                    let category = 'Uncategorized';

                    if (commonMetric) {
                        name = commonMetric.name;
                        category = commonMetric.category;
                    } else {
                        // Try to find in Guide Mapping
                        // We check both line_item_mapping and metrics_mapping
                        const guideLineItem = guide.mapping_rules?.line_items?.[item.line_item_id];
                        // Metrics mapping is Nelly-specific but good to check
                        const guideMetric = (guide as any).metrics_mapping?.[item.line_item_id];

                        if (guideMetric && guideMetric.labels && guideMetric.labels.length > 0) {
                            name = guideMetric.labels[0];
                            category = 'Reported Metric';
                        } else if (guideLineItem && guideLineItem.label_match) {
                            name = guideLineItem.label_match;
                            category = 'Line Item';
                        } else {
                            // Fallback: Format ID (e.g. total_revenue -> Total Revenue)
                            name = item.line_item_id
                                .split('_')
                                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(' ');
                        }
                    }
                    
                    uniqueLineItems.set(item.line_item_id, { name, category });
                }
            }

            // Upsert Dimensions
            if (uniqueLineItems.size > 0) {
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
                    // We log but try to proceed, though facts insert will likely fail
                }
            }

            for (const item of lineItems) {
                // Prepare fact row
                const factRow = {
                    company_id: companyId,
                    date: item.date || periodDate,
                    line_item_id: item.line_item_id,
                    amount: item.amount,
                    currency: guide.company_metadata?.currency || (guide as any).company?.currency || 'USD',
                    source_file_id: sourceFileId,
                    source_location: item.source_location as any // Cast for now, will update with snippet
                };

                if (fileType === 'pdf' && item.source_location.page) {
                    const pageNum = item.source_location.page;
                    
                    // Generate snippet if not cached for this file+page combo
                    // Use full filePath in key to avoid collisions across files in same batch
                    const snippetKey = `${filePath}_page_${pageNum}`;
                    if (!processedPages.has(snippetKey)) {
                        console.log(`[Ingest] Generating audit snippet for ${fileMeta.filename} page ${pageNum}...`);
                        try {
                            const snippetBuffer = await extractPageSnippet(fileMeta.buffer, pageNum);
                            // Include sanitized filename to ensure uniqueness across files
                            const safeFilename = fileMeta.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                            const snippetPath = `${companySlug}/${Date.now()}_${safeFilename}_page_${pageNum}.pdf`;
                            
                            const { error: uploadError } = await supabase.storage
                                .from('financial-snippets')
                                .upload(snippetPath, snippetBuffer, { contentType: 'application/pdf' });
                                
                            if (uploadError) {
                                console.error('Failed to upload snippet:', uploadError);
                            } else {
                                // In a real scenario we might store the snippet URL in the fact
                                // For now, we assume standard naming convention or just presence in bucket
                            }
                        } catch (err) {
                            console.error(`Failed to generate/upload snippet for page ${pageNum}`, err);
                        } finally {
                            // Mark processed regardless of success to prevent endless retries in this request
                            processedPages.add(snippetKey);
                        }
                    }
                }
                
                factRows.push(factRow);
            }

            // 4c. Persist Raw Facts
            if (factRows.length > 0) {
                const { error: factsError } = await supabase
                    .from('fact_financials')
                    .insert(factRows);
                
                if (factsError) {
                    console.error('Error persisting fact_financials:', factsError);
                    throw new Error('Failed to save financial data to database');
                }
            }

            // 5. Compute Metrics
            // Convert lineItems array to Record<string, number>
            // IMPORTANT: Aggregate duplicate line_item_ids by summing their amounts
            const facts: Record<string, number> = {};
            const duplicateCounts: Record<string, number> = {};
            
            lineItems.forEach(item => {
                if (facts[item.line_item_id] !== undefined) {
                    // Aggregate: sum values for duplicate line_item_ids
                    facts[item.line_item_id] += item.amount;
                    duplicateCounts[item.line_item_id] = (duplicateCounts[item.line_item_id] || 1) + 1;
                } else {
                    facts[item.line_item_id] = item.amount;
                }
            });
            
            // Log any aggregations for audit visibility
            const aggregatedKeys = Object.keys(duplicateCounts);
            if (aggregatedKeys.length > 0) {
                console.log(`[Ingest] Aggregated ${aggregatedKeys.length} duplicate line_item_ids:`, 
                    aggregatedKeys.map(k => `${k} (${duplicateCounts[k]} values summed)`).join(', '));
            }

            const metrics = computeMetricsForPeriod(companyId, periodDate, facts);
            
            // 5b. Persist Metrics
            if (metrics.length > 0) {
                await saveMetricsToDb(metrics, companyId, supabase);
            }

            // Determine if this was a meaningful extraction
            // Zero line items may indicate a guide mapping issue - treat as "needs_review"
            const extractionStatus = lineItems.length > 0 ? 'success' : 'needs_review';
            
            results.push({
                file: fileMeta.filename,
                line_items_found: lineItems.length,
                metrics_computed: metrics.length,
                metrics_sample: metrics.slice(0, 3),
                status: extractionStatus,
                ...(extractionStatus === 'needs_review' && {
                    warning: 'File parsed successfully but extracted 0 line items. Check guide mapping rules.'
                })
            });

            // 6. Cleanup: Delete file from storage ONLY on full success
            // User requirement: "failed files should be retained for investigation"
            // Also retain files with zero extractions for debugging guide/mapping issues
            if (lineItems.length > 0) {
                console.log(`[Ingest] Deleting ${filePath} from storage (successful extraction)...`);
                await deleteFile(filePath);
            } else {
                console.log(`[Ingest] Retaining ${filePath} for investigation (0 line items extracted)`);
            }

        } catch (fileError: any) {
            console.error(`Error processing file ${filePath}:`, fileError);
            // Ensure we capture the error message as a string, handling non-Error objects
            const errorMessage = fileError?.message || (typeof fileError === 'string' ? fileError : JSON.stringify(fileError));
            results.push({
                file: filePath,
                status: 'error',
                error: errorMessage
            });
            // Do NOT delete file here, keep for debugging
        }
    }

    // Determine overall status based on individual file results
    const successCount = results.filter(r => r.status === 'success').length;
    const needsReviewCount = results.filter(r => r.status === 'needs_review').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    // Overall status logic:
    // - 'success': All files extracted data successfully
    // - 'partial': Some files succeeded, some failed or need review
    // - 'needs_review': All files parsed but none extracted data
    // - 'error': All files failed to parse
    let overallStatus: string;
    if (errorCount === results.length) {
        overallStatus = 'error';
    } else if (successCount === results.length) {
        overallStatus = 'success';
    } else if (needsReviewCount === results.length) {
        overallStatus = 'needs_review';
    } else {
        overallStatus = 'partial';
    }
    
    // Return appropriate HTTP status code
    // 207 Multi-Status for any mixed results (partial or needs_review)
    const httpStatus = overallStatus === 'error' ? 500 : (overallStatus === 'success' ? 200 : 207);
    
    return NextResponse.json({
      status: overallStatus,
      company: companySlug,
      summary: {
        total: results.length,
        success: successCount,
        needs_review: needsReviewCount,
        error: errorCount
      },
      results
    }, { status: httpStatus });

  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : String(error),
      status: 'error'
    }, { status: 500 });
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
