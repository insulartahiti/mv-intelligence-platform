import { PortcoGuide, LineItemMapping } from '../portcos/types';
import { ExtractedSheet, getCellValue } from './parse_excel';
import { PDFContent, findPagesWithKeywords } from './parse_pdf_vision';
import { UnifiedExtractionResult } from './unified_extractor'; 

export interface NormalizedLineItem {
  line_item_id: string;
  amount: number;
  date?: string;
  scenario?: 'actual' | 'budget' | 'forecast'; // Actual vs Budget vs Forecast
  source_location: {
    file_type: 'xlsx' | 'pdf';
    sheet?: string; // Excel
    cell?: string; // Excel
    page?: number; // PDF
    context?: string; // Extra debug info
    // Bounding box for visual highlighting (percentage of page, 0-1 range)
    bbox?: {
      x: number;      // Left edge
      y: number;      // Top edge
      width: number;
      height: number;
    };
  };
}

/**
 * Normalize extracted metric keys to standard IDs
 * Maps variations like "total_actual_mrr" -> "mrr", "monthly_revenue" -> "mrr"
 */
function normalizeMetricKey(key: string): string {
  const lowerKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  // Direct mappings for common variations
  const mappings: Record<string, string> = {
    // MRR variations
    'total_actual_mrr': 'mrr',
    'actual_mrr': 'mrr',
    'monthly_recurring_revenue': 'mrr',
    'monthly_revenue': 'mrr',
    'total_mrr': 'mrr',
    
    // MRR by segment
    'actual_saas_mrr': 'mrr_saas',
    'saas_mrr': 'mrr_saas',
    'actual_finos_mrr': 'mrr_finos',
    'finos_mrr': 'mrr_finos',
    
    // ARR variations
    'annual_recurring_revenue': 'arr',
    'total_arr': 'arr',
    'actual_arr': 'arr',
    
    // Customer variations
    'customer_count': 'customers',
    'total_customers': 'customers',
    'saas': 'customers_saas',
    'saas_customers': 'customers_saas',
    'finos': 'customers_finos',
    'finos_customers': 'customers_finos',
    
    // Cash/Runway
    'cash': 'cash_balance',
    'cash_position': 'cash_balance',
    'runway': 'runway_months',
    'cash_runway': 'runway_months',
    
    // Burn
    'burn': 'monthly_burn',
    'burn_rate': 'monthly_burn',
    'net_burn': 'monthly_burn',
    
    // Growth
    'mrr_growth': 'mrr_growth_mom',
    'arr_growth': 'arr_growth_yoy',
    'revenue_growth': 'revenue_growth_mom',
    
    // Retention
    'net_revenue_retention': 'nrr',
    'gross_revenue_retention': 'grr',
    'churn': 'logo_churn',
    'customer_churn': 'logo_churn',
  };
  
  // Check direct mapping
  if (mappings[lowerKey]) {
    return mappings[lowerKey];
  }
  
  // Return as-is if no mapping found (already normalized or custom metric)
  return lowerKey;
}

/**
 * Parse a number string with support for both US/UK and EUR formats.
 * 
 * US/UK format: 1,234.56 (comma = thousands, period = decimal)
 * EUR format:   1.234,56 (period = thousands, comma = decimal)
 * 
 * Detection heuristic:
 * - If string has both ',' and '.':
 *   - If ',' comes after '.', it's EUR (1.234,56)
 *   - If '.' comes after ',', it's US/UK (1,234.56)
 * - If only one separator, assume it's the decimal if it has 1-2 digits after
 * - If only commas with 3+ digits between, assume thousands separator
 */
function parseLocalizedNumber(rawNum: string, defaultCurrency: string = 'USD'): number | null {
  if (!rawNum || rawNum.trim() === '') return null;
  
  // Remove any currency symbols, spaces, and other non-numeric chars except . and ,
  let cleaned = rawNum.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) return null;
  
  // Handle negative numbers
  // Check for:
  // 1. Leading minus sign in cleaned string (after removing currency symbols)
  // 2. Parentheses notation: (1,234.56) is negative in accounting
  // 3. Leading minus in original string (before any text): "-1,234" but NOT "acme-123"
  const hasParenthesesNegation = rawNum.includes('(') && rawNum.includes(')');
  const hasLeadingMinus = cleaned.startsWith('-') || /^\s*-/.test(rawNum);
  const isNegative = hasLeadingMinus || hasParenthesesNegation;
  cleaned = cleaned.replace(/^-/, '');
  
  const hasComma = cleaned.includes(',');
  const hasPeriod = cleaned.includes('.');
  
  let result: number;
  
  if (hasComma && hasPeriod) {
    // Both separators present - determine format by position
    const lastCommaPos = cleaned.lastIndexOf(',');
    const lastPeriodPos = cleaned.lastIndexOf('.');
    
    if (lastCommaPos > lastPeriodPos) {
      // EUR format: 1.234,56 - comma is decimal separator
      // Remove periods (thousands), replace comma with period
      result = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    } else {
      // US/UK format: 1,234.56 - period is decimal separator
      // Remove commas (thousands)
      result = parseFloat(cleaned.replace(/,/g, ''));
    }
  } else if (hasComma && !hasPeriod) {
    // Only comma - could be EUR decimal or US thousands
    const parts = cleaned.split(',');
    const lastPart = parts[parts.length - 1];
    
    if (parts.length === 2 && lastPart.length <= 2) {
      // Likely EUR decimal: 1234,56 or 123,5
      result = parseFloat(cleaned.replace(',', '.'));
    } else if (defaultCurrency === 'EUR' && parts.length === 2) {
      // EUR context and ambiguous - treat as decimal
      result = parseFloat(cleaned.replace(',', '.'));
    } else {
      // Likely US thousands: 1,234 or 1,234,567
      result = parseFloat(cleaned.replace(/,/g, ''));
    }
  } else if (hasPeriod && !hasComma) {
    // Only period - could be US decimal or EUR thousands
    const parts = cleaned.split('.');
    const lastPart = parts[parts.length - 1];
    
    if (parts.length === 2 && lastPart.length <= 2) {
      // Likely US decimal: 1234.56
      result = parseFloat(cleaned);
    } else if (defaultCurrency === 'EUR' && parts.length > 2) {
      // EUR thousands: 1.234.567
      result = parseFloat(cleaned.replace(/\./g, ''));
    } else {
      // Assume decimal
      result = parseFloat(cleaned);
    }
  } else {
    // No separators - just parse directly
    result = parseFloat(cleaned);
  }
  
  if (isNaN(result)) return null;
  return isNegative ? -result : result;
}

/**
 * Core logic to map extracted data to normalized schema.
 * 
 * Supports both:
 * - Legacy format: ExtractedSheet[] | PDFContent
 * - Unified format: UnifiedExtractionResult (from unified_extractor.ts)
 * 
 * The unified format includes financial_summary from GPT-5.1 and benchmarks from Perplexity.
 */
export async function mapDataToSchema(
  fileType: 'xlsx' | 'pdf',
  data: ExtractedSheet[] | PDFContent | UnifiedExtractionResult,
  guide: PortcoGuide,
  filename: string,
  periodDate: string 
): Promise<NormalizedLineItem[]> {
  const results: NormalizedLineItem[] = [];
  
  // Check if this is a UnifiedExtractionResult
  const isUnified = 'info' in data && 'fileType' in data;
  
  console.log(`[Mapping] Input type: ${isUnified ? 'UnifiedExtractionResult' : 'Legacy'}, fileType: ${fileType}`);
  
  // If unified, extract financial_summary metrics first (highest confidence)
  if (isUnified) {
    const unifiedData = data as UnifiedExtractionResult;
    const financialSummary = unifiedData.financial_summary;
    
    console.log(`[Mapping] Unified data: ${unifiedData.pageCount} pages, fullText length: ${unifiedData.fullText?.length || 0}`);
    console.log(`[Mapping] Pages with tables: ${unifiedData.pages?.filter(p => p.tables?.length > 0).length || 0}`);
    
    // Handle new actuals/budget structure
    const actuals = financialSummary?.actuals || financialSummary?.key_metrics || {};
    const budget = financialSummary?.budget || {};
    
    console.log(`[Mapping] Actuals: ${Object.keys(actuals).length} metrics, Budget: ${Object.keys(budget).length} metrics`);
    
    // Get source locations for visual highlighting
    const sourceLocations = financialSummary?.source_locations || {};
    
    // Extract ACTUALS
    if (Object.keys(actuals).length > 0) {
      console.log(`[Mapping] Actuals metrics: ${JSON.stringify(actuals)}`);
      
      for (const [metricKey, value] of Object.entries(actuals)) {
        if (typeof value === 'number' && !isNaN(value)) {
          // Normalize metric key to standard ID
          const normalizedKey = normalizeMetricKey(metricKey);
          
          // Get source location with bbox if available
          const srcLoc = sourceLocations[metricKey] || sourceLocations[normalizedKey];
          
          results.push({
            line_item_id: normalizedKey,
            amount: value,
            date: periodDate,
            scenario: 'actual',
            source_location: {
              file_type: unifiedData.fileType,
              page: srcLoc?.page || 1,
              bbox: srcLoc?.bbox,
              context: `GPT-5.1 actuals (${financialSummary?.currency || 'EUR'})`
            }
          });
        }
      }
    }
    
    // Extract BUDGET/PLAN
    if (Object.keys(budget).length > 0) {
      console.log(`[Mapping] Budget metrics: ${JSON.stringify(budget)}`);
      
      for (const [metricKey, value] of Object.entries(budget)) {
        if (typeof value === 'number' && !isNaN(value)) {
          const normalizedKey = normalizeMetricKey(metricKey);
          
          // Get source location with bbox if available (budget metrics may have different key)
          const srcLoc = sourceLocations[`budget_${metricKey}`] || sourceLocations[metricKey];
          
          results.push({
            line_item_id: normalizedKey,
            amount: value,
            date: periodDate,
            scenario: 'budget',
            source_location: {
              file_type: unifiedData.fileType,
              page: srcLoc?.page || 1,
              bbox: srcLoc?.bbox,
              context: `GPT-5.1 budget (${financialSummary?.currency || 'EUR'})`
            }
          });
        }
      }
    }
    
    if (Object.keys(actuals).length === 0 && Object.keys(budget).length === 0) {
      console.warn(`[Mapping] No financial_summary metrics found in unified result`);
    }
    
    // Convert unified to legacy format for remaining processing
    if (unifiedData.fileType === 'xlsx' && unifiedData.info.deterministic_data) {
      // Use deterministic Excel data
      data = unifiedData.info.deterministic_data.sheets.map((s: any) => ({
        sheetName: s.sheetName,
        data: s.data,
        range: s.range
      })) as ExtractedSheet[];
    } else {
      // Use pages as PDFContent
      data = {
        pageCount: unifiedData.pageCount,
        pages: unifiedData.pages,
        fullText: unifiedData.fullText,
        info: unifiedData.info
      } as PDFContent;
    }
  }
  
  // 1. Handle Excel Mapping
  if (fileType === 'xlsx' && Array.isArray(data)) {
    const sheets = data as ExtractedSheet[];
    // Safely access mapping_rules (Nelly guide might not have this structure)
    const rules = guide.mapping_rules?.line_items || {};

    for (const [lineItemId, mapping] of Object.entries(rules)) {
      if (mapping.source !== 'financials') continue;
      // ... (Existing Excel logic) ...
      // If the guide uses simpler "range_start", we use that.
      if (mapping.sheet && mapping.range_start) {
        const sheet = sheets.find(s => s.sheetName === mapping.sheet);
        if (sheet) {
          const val = getCellValue(sheet, mapping.range_start);
          if (typeof val === 'number') {
            results.push({
              line_item_id: lineItemId,
              amount: val,
              date: periodDate,
              source_location: { file_type: 'xlsx', sheet: mapping.sheet, cell: mapping.range_start }
            });
          }
        }
      }
    }

    // B. LLM Cross-Check / Augmentation
    // Always run LLM if we have rules, to cross-check or find missing items
    try {
        // Import lazily
        const { extractFinancialsFromExcelLLM } = await import('../extraction/llm_extractor');
        
        // Group mappings by sheet to handle multi-sheet guides efficiently
        const sheetMappings: Record<string, Record<string, string>> = {};
        let defaultSheetName = sheets[0]?.sheetName;
        
        for (const [lineItemId, mapping] of Object.entries(rules)) {
            if (mapping.source === 'financials') {
                const sheetName = mapping.sheet || defaultSheetName;
                if (sheetName) {
                    if (!sheetMappings[sheetName]) sheetMappings[sheetName] = {};
                    sheetMappings[sheetName][lineItemId] = `Find value for '${mapping.label_match || lineItemId}'`;
                }
            }
        }

        // Process each relevant sheet with LLM
        for (const [sheetName, mappingGoals] of Object.entries(sheetMappings)) {
            const sheet = sheets.find(s => s.sheetName === sheetName);
            if (!sheet) continue;

            console.log(`[Ingestion] Running LLM extraction on sheet '${sheetName}' for cross-check...`);
            const llmResults = await extractFinancialsFromExcelLLM(sheet.data, mappingGoals, sheetName);

            for (const [metricId, data] of Object.entries(llmResults)) {
                if (!data || typeof data.value !== 'number') continue;

                const existingItemIndex = results.findIndex(r => r.line_item_id === metricId);
                
                if (existingItemIndex !== -1) {
                    // Item found deterministically - Cross Check
                    const existing = results[existingItemIndex];
                    // Simple tolerance check (e.g. 1%)
                    const diff = Math.abs(existing.amount - data.value);
                    const isMismatch = diff > (Math.abs(existing.amount) * 0.01) && diff > 1;

                    if (isMismatch) {
                        console.warn(`[Ingestion] Mismatch for ${metricId}: Deterministic=${existing.amount}, LLM=${data.value}`);
                        // Update context to reflect mismatch
                        existing.source_location.context = 
                            (existing.source_location.context || '') + 
                            ` [LLM Mismatch: Found ${data.value} in ${data.cell}]`;
                    } else {
                        // Match confirmed
                        existing.source_location.context = 
                            (existing.source_location.context || '') + 
                            ` [LLM Verified]`;
                    }
                } else {
                    // Item NOT found deterministically - Add as new (Augmentation)
                    console.log(`[Ingestion] LLM found missing item: ${metricId} = ${data.value}`);
                    results.push({
                        line_item_id: metricId,
                        amount: data.value,
                        date: periodDate,
                        source_location: { 
                            file_type: 'xlsx', 
                            sheet: sheetName, 
                            cell: data.cell,
                            context: `LLM Extracted (Confidence: ${data.confidence})`
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.error('[Ingestion] LLM extraction error:', err);
    }
  }

  // 2. Handle PDF Mapping (Enhanced with GPT-5.1 extraction)
  if (fileType === 'pdf' && 'pages' in (data as any)) {
    const pdfContent = data as PDFContent;
    const currency = guide.company_metadata?.currency || 'USD';
    
    // A. First, extract from financial_summary if available (from GPT-5.1 structured analysis)
    const financialSummary = pdfContent.info?.financial_summary;
    if (financialSummary?.key_metrics) {
      console.log(`[Ingestion] Using GPT-5.1 financial_summary with ${Object.keys(financialSummary.key_metrics).length} metrics`);
      
      for (const [metricKey, value] of Object.entries(financialSummary.key_metrics)) {
        if (typeof value === 'number' && !isNaN(value)) {
          results.push({
            line_item_id: metricKey,
            amount: value,
            date: periodDate,
            source_location: {
              file_type: 'pdf',
              page: 1,
              context: `GPT-5.1 financial_summary extraction`
            }
          });
        }
      }
    }
    
    // B. Extract from structured tables found by GPT-5.1 Vision
    for (const page of pdfContent.pages) {
      if (!page.tables || page.tables.length === 0) continue;
      
      for (const table of page.tables) {
        // Try to map table rows to known metrics
        if (table.headers && table.rows) {
          // Find value column index (look for "Value", "Amount", "End of Month", etc.)
          const valueColIndex = table.headers.findIndex(h => 
            /value|amount|total|end\s*of\s*month|actual|current/i.test(String(h))
          );
          const metricColIndex = table.headers.findIndex(h =>
            /metric|kpi|item|description|name/i.test(String(h))
          );
          
          for (const row of table.rows) {
            // Get metric name and value
            let metricName = metricColIndex >= 0 ? String(row[metricColIndex] || '') : String(row[0] || '');
            let rawValue = valueColIndex >= 0 ? row[valueColIndex] : row[row.length - 1];
            
            if (!metricName || rawValue === undefined || rawValue === null) continue;
            
            // Convert metric name to standard ID format
            const metricId = metricName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '');
            
            // Parse value
            let amount: number | null = null;
            if (typeof rawValue === 'number') {
              amount = rawValue;
            } else if (typeof rawValue === 'string') {
              amount = parseLocalizedNumber(rawValue, currency);
            }
            
            if (amount !== null && !isNaN(amount) && metricId) {
              // Check if this metric already exists (from financial_summary)
              const existingIndex = results.findIndex(r => r.line_item_id === metricId);
              if (existingIndex === -1) {
                results.push({
                  line_item_id: metricId,
                  amount,
                  date: periodDate,
                  source_location: {
                    file_type: 'pdf',
                    page: page.pageNumber,
                    context: `GPT-5.1 table: ${table.title || 'Unnamed'}`
                  }
                });
              }
            }
          }
        }
      }
    }
    
    // C. Fallback: Guide-based regex extraction (for metrics not found by LLM)
    const docStructure = (guide as any).document_structure;
    if (docStructure) {
       for (const templateKey of Object.keys(docStructure)) {
         const template = docStructure[templateKey];
         if (!template.kpi_tables) continue;
         
         for (const [tableKey, tableConfig] of Object.entries(template.kpi_tables) as [string, any][]) {
            let targetPages: number[] = [];
            
            if (tableConfig.anchor_text) {
               targetPages = findPagesWithKeywords(pdfContent, tableConfig.anchor_text);
            }

            if (targetPages.length === 0) continue;
            
            console.log(`[Ingestion] Guide-based search: table '${tableKey}' on page(s) ${targetPages.join(', ')}`);
            
            if (tableConfig.metric_rows && targetPages.length > 0) {
                for (const pageNum of targetPages) {
                    const pageIndex = pageNum - 1;
                    if (pageIndex < 0 || pageIndex >= pdfContent.pages.length) continue;
                    
                    const pageText = pdfContent.pages[pageIndex].text;
                
                    for (const [metricKey, label] of Object.entries(tableConfig.metric_rows)) {
                        // Skip if already found by LLM extraction
                        if (results.some(r => r.line_item_id === metricKey)) continue;
                        
                        const escapedLabel = (label as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`${escapedLabel}[^\\d\\n]*([\\d,.]+)`, 'i');
                        const match = pageText.match(regex);
                        
                        if (match && match[1]) {
                            const cleanNum = parseLocalizedNumber(match[1], currency);
                            
                            if (cleanNum !== null) {
                                results.push({
                                    line_item_id: metricKey,
                                    amount: cleanNum,
                                    date: periodDate,
                                    source_location: {
                                        file_type: 'pdf',
                                        page: pageNum,
                                        context: `Guide regex from '${label}'`
                                    }
                                });
                            }
                        }
                    }
                }
            }
         }
       }
    }
    
    console.log(`[Ingestion] PDF mapping complete: ${results.length} line items extracted`);
  }

  return results;
}
