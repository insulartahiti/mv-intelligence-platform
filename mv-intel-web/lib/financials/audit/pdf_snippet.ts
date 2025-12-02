import { PDFDocument } from 'pdf-lib';

/**
 * Extracts a single page from a PDF buffer and returns it as a new PDF buffer.
 */
export async function extractPageSnippet(
    pdfBuffer: Buffer, 
    pageNumber: number // 1-based index
): Promise<Buffer> {
    try {
        const srcDoc = await PDFDocument.load(pdfBuffer);
        const snippetDoc = await PDFDocument.create();
        
        // Copy the page (indices are 0-based)
        const [page] = await snippetDoc.copyPages(srcDoc, [pageNumber - 1]);
        snippetDoc.addPage(page);
        
        const snippetBytes = await snippetDoc.save();
        return Buffer.from(snippetBytes);
    } catch (error) {
        console.error('Error extracting page snippet:', error);
        throw new Error(`Failed to extract page ${pageNumber} from PDF`);
    }
}


