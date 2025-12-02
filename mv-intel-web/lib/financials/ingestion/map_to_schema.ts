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
    const rules = guide.mapping_rules.line_items;

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
            
            // If we had the LLM connected here:
            // const values = await extractMetricsFromPage(pdfContent.pages[targetPages[0]-1].text, tableConfig.metric_rows);
            // results.push(...values);
         }
       }
    }
  }

  return results;
}
