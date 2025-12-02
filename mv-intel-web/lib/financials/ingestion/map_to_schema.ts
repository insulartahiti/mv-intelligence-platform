import { PortcoGuide, LineItemMapping } from '../portcos/types';
import { ExtractedSheet, getCellValue } from './parse_excel';
import { PDFContent, findPagesWithKeywords } from './parse_pdf';
// Import dynamically to avoid potential circular dep issues during init if any
// import { extractFinancialsFromExcelLLM } from '../extraction/llm_extractor'; 

export interface NormalizedLineItem {
  line_item_id: string;
  amount: number;
  date?: string; 
  source_location: {
    file_type: 'xlsx' | 'pdf';
    sheet?: string; // Excel
    cell?: string; // Excel
    page?: number; // PDF
    context?: string; // Extra debug info
  };
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
 * Now enhanced to support complex "document_structure" and "parsing_hints" from guides (like Nelly).
 */
export async function mapDataToSchema(
  fileType: 'xlsx' | 'pdf',
  data: ExtractedSheet[] | PDFContent,
  guide: PortcoGuide,
  filename: string,
  periodDate: string 
): Promise<NormalizedLineItem[]> {
  const results: NormalizedLineItem[] = [];
  
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

  // 2. Handle PDF Mapping (Complex/Nelly Style)
  if (fileType === 'pdf' && 'pages' in (data as any)) {
    const pdfContent = data as PDFContent;
    
    // Check for "document_structure" in the guide (Nelly style)
    // This part is "bespoke" interpretation of the YAML structure we saw in Nelly's guide.
    // We need to iterate over the 'kpi_tables' defined in the guide.
    
    const docStructure = (guide as any).document_structure; // Cast to access flexible schema
    if (docStructure) {
       // Loop through known templates (e.g. monthly_investor_report_template_2025)
       for (const templateKey of Object.keys(docStructure)) {
         const template = docStructure[templateKey];
         if (!template.kpi_tables) continue;

         // Identify if this file matches the template (e.g. via filename or content)
         // For now, assume if the user selected the guide, we try to apply it.
         
         for (const [tableKey, tableConfig] of Object.entries(template.kpi_tables) as [string, any][]) {
            // Find the page(s) for this table
            let targetPages: number[] = [];
            
            // If hints exist for this specific file ID (from guide source_docs), use them
            // Otherwise use anchor text
            if (tableConfig.anchor_text) {
               targetPages = findPagesWithKeywords(pdfContent, tableConfig.anchor_text);
            }

            if (targetPages.length === 0) continue;

            // Mock Extraction: In a real system, we'd send these pages to an LLM or OCR table extractor
            // "Here is the text of page 5. Extract the value for 'Total actual MRR' from column 'End of Month'."
            
            // For this stub, we will just log that we found the page and "pretend" to extract if we had an LLM
            // We can't do robust table extraction with just regex on raw PDF text usually.
            
            console.log(`[Ingestion] Found potential table '${tableKey}' on page(s) ${targetPages.join(', ')}`);
            
            // Basic Heuristic Extraction (Stub for LLM)
            // Attempt to find metric labels on ALL matching pages (not just the first)
            if (tableConfig.metric_rows && targetPages.length > 0) {
                // Process ALL matching pages to handle multi-page tables
                for (const pageNum of targetPages) {
                    // Validate page number is within bounds
                    const pageIndex = pageNum - 1;
                    if (pageIndex < 0 || pageIndex >= pdfContent.pages.length) {
                        console.warn(`[Ingestion] Page ${pageNum} out of bounds (PDF has ${pdfContent.pages.length} pages)`);
                        continue;
                    }
                    const pageText = pdfContent.pages[pageIndex].text;
                
                for (const [metricKey, label] of Object.entries(tableConfig.metric_rows)) {
                    // Simple regex: Label followed by some chars and then a number
                    // We escape the label for regex safety
                    const escapedLabel = (label as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Look for label, allowing for whitespace, then capturing a number (including decimals/commas)
                    // This is very naive and assumes the number is to the right or below.
                    const regex = new RegExp(`${escapedLabel}[^\\d\\n]*([\\d,.]+)`, 'i');
                    const match = pageText.match(regex);
                    
                    if (match && match[1]) {
                        // Parse number with EUR/US format detection
                        // Use guide currency as hint for ambiguous cases
                        const currency = guide.company_metadata?.currency || 'USD';
                        const cleanNum = parseLocalizedNumber(match[1], currency);
                        
                        if (cleanNum !== null) {
                            results.push({
                                line_item_id: metricKey,
                                amount: cleanNum,
                                date: periodDate,
                                source_location: {
                                    file_type: 'pdf',
                                    page: pageNum,  // Use current page, not first page
                                    context: `Extracted via regex from '${label}'`
                                }
                            });
                        }
                    }
                }
                }  // End of: for (const pageNum of targetPages)
            }
         }
       }
    }
  }

  return results;
}
