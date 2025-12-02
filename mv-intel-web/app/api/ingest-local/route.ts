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
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';
import { loadFile } from '@/lib/financials/ingestion/load_file';
import { extractFinancialDocument, UnifiedExtractionResult } from '@/lib/financials/ingestion/unified_extractor';
import { mapDataToSchema } from '@/lib/financials/ingestion/map_to_schema';
import { computeMetricsForPeriod } from '@/lib/financials/metrics/compute_metrics';
import { getMetricById } from '@/lib/financials/metrics/loader';
import {
  hashFileContent,
  getCachedExtraction,
  setCachedExtraction,
  saveExtractionResult,
  loadLatestExtraction,
  saveFacts,
  saveMetrics,
  compareExtractions,
  getLocalDataSummary,
  LocalFactRecord,
  LocalMetricRecord
} from '@/lib/financials/local/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Extract period date from filename using pattern matching
 */
function extractPeriodDateFromFilename(filename: string): string | null {
  const patterns = [
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
    
    const results = [];
    
    for (const filePath of filePaths) {
      console.log(`[Local Ingest] Processing ${filePath} for ${companySlug}...`);
      
      try {
        // 1. Load File
        const fileMeta = await loadFile(filePath);
        const fileHash = hashFileContent(fileMeta.buffer);
        
        // 2. Load Guide
        const guide = loadPortcoGuide(companySlug);
        
        // 3. Check cache (unless forceReextract)
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
        
        // 4. Extract if not cached
        if (!usedCache) {
          console.log(`[Local Ingest] Running extraction for ${fileMeta.filename}...`);
          extractedData = await extractFinancialDocument(fileMeta, guide);
          
          // Cache the result
          if (useCache) {
            setCachedExtraction(fileHash, fileMeta.filename, extractedData);
          }
        }
        
        // 5. Extract period
        const summary = extractedData.financial_summary;
        let periodDate: string | null = null;
        
        if (summary?.period) {
          periodDate = extractPeriodDateFromFilename(summary.period);
        }
        if (!periodDate) {
          periodDate = extractPeriodDateFromFilename(fileMeta.filename);
        }
        if (!periodDate) {
          periodDate = new Date().toISOString().slice(0, 10); // Fallback to today
          console.warn(`[Local Ingest] Could not determine period, using today: ${periodDate}`);
        }
        
        // 6. Map to schema
        const lineItems = await mapDataToSchema(
          extractedData.fileType,
          extractedData,
          guide,
          fileMeta.filename,
          periodDate
        );
        
        // 7. Compute metrics (only from Actuals)
        const facts: Record<string, number> = {};
        lineItems.forEach(item => {
          if (item.scenario && item.scenario !== 'actual') return;
          facts[item.line_item_id] = item.amount;
        });
        
        const computedMetrics = computeMetricsForPeriod(
          '00000000-0000-0000-0000-000000000000', // Mock ID for local
          periodDate,
          facts
        );
        
        // 8. Save to local storage
        const savedPath = saveExtractionResult(
          companySlug,
          fileMeta.filename,
          fileHash,
          extractedData,
          lineItems,
          computedMetrics
        );
        
        // Save facts
        const factRecords: LocalFactRecord[] = lineItems.map(item => ({
          line_item_id: item.line_item_id,
          amount: item.amount,
          scenario: item.scenario || 'actual',
          date: item.date || periodDate,
          source_file: fileMeta.filename,
          source_location: item.source_location,
          extractedAt: new Date().toISOString()
        }));
        saveFacts(companySlug, periodDate, factRecords);
        
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
          status: lineItems.length > 0 ? 'success' : 'needs_review',
          usedCache,
          savedPath,
          period: periodDate,
          line_items_found: lineItems.length,
          metrics_computed: computedMetrics.length,
          extracted_data: lineItems.map(item => ({
            line_item_id: item.line_item_id,
            amount: item.amount,
            scenario: item.scenario || 'Actual',
            source_location: item.source_location
          })),
          computed_metrics: computedMetrics.map(m => ({
            metric_id: m.metric_id,
            value: m.value,
            unit: getMetricById(m.metric_id)?.unit || 'unknown',
            period: m.period
          })),
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

