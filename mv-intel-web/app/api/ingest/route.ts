import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide, listConfiguredPortcos } from '@/lib/financials/portcos/loader';
import { loadFile, deleteFile } from '@/lib/financials/ingestion/load_file';
import { parsePDF } from '@/lib/financials/ingestion/parse_pdf';
import { parseExcel } from '@/lib/financials/ingestion/parse_excel';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod } from '@/lib/financials/metrics/compute_metrics';

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
            
            // 3. Parse & Map
            let extractedData;
            let fileType: 'pdf' | 'xlsx' = 'pdf';
            
            if (fileMeta.filename.endsWith('.pdf')) {
                extractedData = await parsePDF(fileMeta);
                fileType = 'pdf';
            } else if (fileMeta.filename.endsWith('.xlsx')) {
                extractedData = await parseExcel(fileMeta);
                fileType = 'xlsx';
            }

            // 4. Map to Schema (Mock date for now, ideally extract from filename/content)
            const periodDate = '2025-09-01'; 
            const lineItems = await mapDataToSchema(fileType, extractedData, guide, fileMeta.filename, periodDate);
            
            // 5. Compute Metrics
            // Convert lineItems array to Record<string, number>
            const facts: Record<string, number> = {};
            lineItems.forEach(item => {
                facts[item.line_item_id] = item.amount;
            });

            const metrics = computeMetricsForPeriod(companySlug, periodDate, facts);

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
    if (slug === 'acme-corp' && filename.toLowerCase().includes('acme')) detected = 'acme-corp';
    if (slug === 'nelly' && filename.toLowerCase().includes('nelly')) detected = 'nelly';
  }

  return NextResponse.json({ detected_slug: detected });
}
