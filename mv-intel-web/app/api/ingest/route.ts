import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide, listConfiguredPortcos } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { parsePDF } from '@/lib/financials/ingestion/parse_pdf';
import { parseExcel } from '@/lib/financials/ingestion/parse_excel';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod } from '@/lib/financials/metrics/compute_metrics';
import { extractPageSnippet } from '@/lib/financials/audit/pdf_snippet';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin for snippet uploads
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Process a file from Storage
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { companySlug, filePaths, notes } = json;

    if (!companySlug || !filePaths || !Array.isArray(filePaths)) {
      return NextResponse.json({ error: 'Missing company or filePaths' }, { status: 400 });
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
                console.warn(`[Ingest] Warning: Company '${companyName}' not found in DB. Metrics will use placeholder ID.`);
            }
            const companyId = companyData?.id || '00000000-0000-0000-0000-000000000000';
            
            // 3. Parse & Map
            let extractedData;
            let fileType: 'pdf' | 'xlsx' = 'pdf';
            
            if (fileMeta.filename.endsWith('.pdf')) {
                extractedData = await parsePDF(fileMeta);
                fileType = 'pdf';
            } else if (fileMeta.filename.endsWith('.xlsx')) {
                extractedData = await parseExcel(fileMeta);
                fileType = 'xlsx';
            } else {
                throw new Error(`Unsupported file type: ${fileMeta.filename}`);
            }

            // 4. Map to Schema (Mock date for now, ideally extract from filename/content)
            const periodDate = '2025-09-01'; 
            const lineItems = await mapDataToSchema(fileType, extractedData, guide, fileMeta.filename, periodDate);
            
            // 4b. Generate Audit Snippets (PDF Pages)
            // We do this BEFORE metrics computation so we can attach snippet URLs to the facts if needed.
            // For now, we'll just generate them for every line item that has a page number.
            
            // Cache snippets to avoid re-generating same page multiple times
            const processedPages = new Set<number>();
            
            for (const item of lineItems) {
                if (fileType === 'pdf' && item.source_location.page) {
                    const pageNum = item.source_location.page;
                    if (!processedPages.has(pageNum)) {
                        console.log(`[Ingest] Generating audit snippet for page ${pageNum}...`);
                        const snippetBuffer = await extractPageSnippet(fileMeta.buffer, pageNum);
                        
                        // Upload to 'financial-snippets' bucket
                        const snippetPath = `${companySlug}/${Date.now()}_page_${pageNum}.pdf`;
                        const { error: uploadError } = await supabase.storage
                            .from('financial-snippets')
                            .upload(snippetPath, snippetBuffer, { contentType: 'application/pdf' });
                            
                        if (uploadError) {
                            console.error('Failed to upload snippet:', uploadError);
                        } else {
                            // Link snippet to the item (in a real DB save, we'd update the fact row)
                            // item.source_location.snippet_url = ...
                            processedPages.add(pageNum);
                        }
                    }
                }
            }

            // 5. Compute Metrics
            // Convert lineItems array to Record<string, number>
            const facts: Record<string, number> = {};
            lineItems.forEach(item => {
                facts[item.line_item_id] = item.amount;
            });

            const metrics = computeMetricsForPeriod(companyId, periodDate, facts);

            results.push({
                file: fileMeta.filename,
                line_items_found: lineItems.length,
                metrics_computed: metrics.length,
                metrics_sample: metrics.slice(0, 3),
                status: 'success'
            });

        } catch (fileError: any) {
            console.error(`Error processing file ${filePath}:`, fileError);
            results.push({
                file: filePath,
                status: 'error',
                error: fileError.message
            });
        } finally {
            // 6. Cleanup: Delete file from storage
            // User requirement: "once files are extracted we should not store them"
            console.log(`[Ingest] Deleting ${filePath} from storage...`);
            await deleteFile(filePath);
        }
    }

    return NextResponse.json({
      status: 'success',
      company: companySlug,
      results
    });

  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

  for (const slug of portcos) {
    if (filename.toLowerCase().includes(slug.toLowerCase())) {
        detected = slug;
        break;
    }
  }

  return NextResponse.json({ detected_slug: detected });
}
