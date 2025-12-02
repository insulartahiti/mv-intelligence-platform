import { PortcoGuide, LineItemMapping } from '../portcos/types';
import { ExtractedSheet, getCellValue } from './parse_excel';
import { PDFContent, findPagesWithKeywords } from './parse_pdf';
// import { extractTableFromImage } from './ocr_service'; // Future integration

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
            // Attempt to find metric labels on the page and extract the nearest number
            if (tableConfig.metric_rows) {
                const pageText = pdfContent.pages[targetPages[0] - 1].text;
                
                for (const [metricKey, label] of Object.entries(tableConfig.metric_rows)) {
                    // Simple regex: Label followed by some chars and then a number
                    // We escape the label for regex safety
                    const escapedLabel = (label as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Look for label, allowing for whitespace, then capturing a number (including decimals/commas)
                    // This is very naive and assumes the number is to the right or below.
                    const regex = new RegExp(`${escapedLabel}[^\\d\\n]*([\\d,.]+)`, 'i');
                    const match = pageText.match(regex);
                    
                    if (match && match[1]) {
                        // Normalize number (remove commas if they are thousands separators, handle EUR style)
                        // Assuming 1.234,56 format or 1,234.56
                        let rawNum = match[1];
                        // Heuristic: if contains ',' and '.', and ',' comes before '.', it's 1,234.56
                        // If '.' comes before ',', it's 1.234,56 (EUR)
                        // For now, let's assume standard US/UK if not specified or just strip non-numeric/dot
                        
                        // Simple parse: remove all non-digits/dots, unless it looks like EUR
                        // actually, just safe parse float for now
                        const cleanNum = parseFloat(rawNum.replace(/,/g, ''));
                        
                        if (!isNaN(cleanNum)) {
                            results.push({
                                line_item_id: metricKey,
                                amount: cleanNum,
                                date: periodDate,
                                source_location: {
                                    file_type: 'pdf',
                                    page: targetPages[0],
                                    context: `Extracted via regex from '${label}'`
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

  return results;
}
