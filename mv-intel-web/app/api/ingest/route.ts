import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide, listConfiguredPortcos } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { parsePDF } from '@/lib/financials/ingestion/parse_pdf';
import { parseExcel } from '@/lib/financials/ingestion/parse_excel';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod, saveMetricsToDb } from '@/lib/financials/metrics/compute_metrics';
import { loadCommonMetrics, getMetricById } from '@/lib/financials/metrics/loader';
import { extractPageSnippet } from '@/lib/financials/audit/pdf_snippet';
import { createClient } from '@supabase/supabase-js';

// Helper to create Supabase client lazily (inside handler, not at module load time)
// This prevents Vercel build failures when env vars aren't available during build
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// Process files from Storage - POST handler for financial data ingestion
// Accepts: { companySlug: string, filePaths: string[], notes?: string }
export async function POST(req: NextRequest) {
  // Initialize Supabase client inside handler (lazy initialization)
  const supabase = getSupabaseClient();
  
  try {
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
            const { data: companyData, error: companyError } = await supabase
                .from('companies')
                .select('id')
                .ilike('name', companyName)
                .single();

            if (companyError && companyError.code !== 'PGRST116') { // PGRST116 is "No rows found"
                 console.error('Database error looking up company:', companyError);
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

            // 4. Map to Schema (Mock date for now, ideally extract from filename/content)
            const periodDate = '2025-09-01'; 
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
                    // Use filename in key to avoid collisions across files in same batch
                    const snippetKey = `${fileMeta.filename}_page_${pageNum}`;
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

            results.push({
                file: fileMeta.filename,
                line_items_found: lineItems.length,
                metrics_computed: metrics.length,
                metrics_sample: metrics.slice(0, 3),
                status: 'success'
            });

            // 6. Cleanup: Delete file from storage ONLY on success
            // User requirement: "failed files should be retained for investigation"
            console.log(`[Ingest] Deleting ${filePath} from storage...`);
            await deleteFile(filePath);

        } catch (fileError: any) {
            console.error(`Error processing file ${filePath}:`, fileError);
            results.push({
                file: filePath,
                status: 'error',
                error: fileError.message
            });
            // Do NOT delete file here, keep for debugging
        }
    }

    // Determine overall status based on individual file results
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const overallStatus = errorCount === 0 ? 'success' : (successCount === 0 ? 'error' : 'partial');
    
    // Return appropriate HTTP status code
    const httpStatus = overallStatus === 'error' ? 500 : (overallStatus === 'partial' ? 207 : 200);
    
    return NextResponse.json({
      status: overallStatus,
      company: companySlug,
      summary: {
        total: results.length,
        success: successCount,
        error: errorCount
      },
      results
    }, { status: httpStatus });

  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      status: 'error'  // Include status field for frontend consistency
    }, { status: 500 });
  }
}

// Endpoint to detect company from filename
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  const portcos = listConfiguredPortcos();
  let detected = null;
  let longestMatch = 0;

  // Sort by slug length descending to prefer longer matches (e.g., 'nelly-test' over 'nelly')
  const sortedPortcos = [...portcos].sort((a, b) => b.length - a.length);
  
  const filenameLower = filename.toLowerCase();
  
  for (const slug of sortedPortcos) {
    const slugLower = slug.toLowerCase();
    
    // Check for slug match with word boundaries to avoid partial matches
    // Match: "Nelly_Board_Q3.pdf", "nelly-financials.xlsx", "NELLY report.pdf"
    // Reject: "nellyland_report.pdf" matching "nelly" (no boundary after)
    const boundaryRegex = new RegExp(`(^|[^a-z0-9])${slugLower.replace(/-/g, '[-_\\s]?')}([^a-z0-9]|$)`, 'i');
    
    if (boundaryRegex.test(filenameLower) && slug.length > longestMatch) {
        detected = slug;
        longestMatch = slug.length;
        // Since sorted by length desc, first match is longest - can break
        break;
    }
  }

  return NextResponse.json({ detected_slug: detected });
}
