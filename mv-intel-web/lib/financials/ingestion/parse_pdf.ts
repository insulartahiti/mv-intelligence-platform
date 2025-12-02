import pdf from 'pdf-parse';
import { FileMetadata } from './load_file';

export interface PDFPage {
  pageNumber: number;
  text: string;
}

export interface PDFContent {
  pageCount: number;
  info: any;
  pages: PDFPage[];
  fullText: string;
}

export async function parsePDF(file: FileMetadata): Promise<PDFContent> {
  const dataBuffer = file.buffer;

  try {
    const pages: PDFPage[] = [];
    
    // We use a custom render callback to capture text per page.
    // The library processes pages sequentially.
    const options = {
      pagerender: async (pageData: any) => {
        // getTextContent returns a structure with strings and transforms
        const textContent = await pageData.getTextContent();
        
        let lastY, text = '';
        // Simple heuristic to reconstruct layout (newlines) based on Y position changes
        for (const item of textContent.items) {
          if (!lastY || Math.abs(item.transform[5] - lastY) < 10) {
             text += item.str;
          }  
          else {
             text += '\n' + item.str;
          }                                   
          lastY = item.transform[5];
        }
        
        // pageIndex is 0-based
        pages.push({
            pageNumber: pageData.pageIndex + 1,
            text: text
        });
        
        // pdf-parse expects a string return to accumulate into data.text
        return text;
      }
    }

    const data = await pdf(dataBuffer, options);

    // Sort pages by number just in case async rendering jumbles them (unlikely but safe)
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      pageCount: data.numpages,
      info: data.info,
      fullText: data.text,
      pages: pages
    };
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF file.');
  }
}

/**
 * Helper to find specific pages based on content hints (anchors).
 * Used when a guide specifies "anchor_text" for finding a table.
 */
export function findPagesWithKeywords(pdfContent: PDFContent, keywords: string[]): number[] {
  const matchedPages: number[] = [];
  
  for (const page of pdfContent.pages) {
    // Check if ALL keywords are present
    const hasAll = keywords.every(kw => page.text.toLowerCase().includes(kw.toLowerCase()));
    if (hasAll) {
      matchedPages.push(page.pageNumber);
    }
  }
  
  return matchedPages;
}
