import { NextRequest, NextResponse } from 'next/server';
import { HTMLToPDFRequest, HTMLToPDFResponse } from '../../../../lib/types/deckCapture';

// For development, we'll use a mock conversion
// In production, we'll use Puppeteer
const USE_MOCK_CONVERSION = process.env.NODE_ENV === 'development';

export async function POST(request: NextRequest) {
  try {
    const body: HTMLToPDFRequest = await request.json();
    
    // Validate request
    if (!body.html_content || body.html_content.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'HTML content is required'
      }, { status: 400 });
    }

    const startTime = Date.now();
    
    let pdfData: string;
    let fileSize: number;
    let pageCount: number;

    if (USE_MOCK_CONVERSION) {
      // Mock conversion for development
      console.log(`Mock converting HTML to PDF for slide ${body.slide_number}`);
      
      // Simulate conversion delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate mock PDF data (base64 encoded)
      pdfData = generateMockPDF(body.html_content);
      fileSize = pdfData.length * 0.75; // Rough estimate
      pageCount = 1;
      
    } else {
      // Real HTML to PDF conversion
      const conversionResult = await convertHTMLToPDF(body.html_content, body.title);
      
      if (!conversionResult.success) {
        throw new Error(conversionResult.error || 'PDF conversion failed');
      }
      
      pdfData = conversionResult.pdf_data;
      fileSize = conversionResult.file_size;
      pageCount = conversionResult.page_count;
    }

    const conversionTime = Date.now() - startTime;

    const response: HTMLToPDFResponse = {
      pdf_data: pdfData,
      file_size: fileSize,
      page_count: pageCount,
      conversion_time_ms: conversionTime,
      success: true
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('HTML to PDF conversion failed:', error);
    
    const errorResponse: HTMLToPDFResponse = {
      pdf_data: '',
      file_size: 0,
      page_count: 0,
      conversion_time_ms: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// Mock PDF generation for development
function generateMockPDF(htmlContent: string): string {
  // This is a placeholder - in production you'd use a real HTML to PDF converter
  const mockPdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Mock PDF - HTML Content Length: ${htmlContent.length}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
297
%%EOF`;

  // Convert to base64
  return Buffer.from(mockPdfContent).toString('base64');
}

// Real HTML to PDF conversion (for production)
async function convertHTMLToPDF(htmlContent: string, title?: string): Promise<HTMLToPDFResponse> {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Generate PDF with professional settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      displayHeaderFooter: false,
      preferCSSPageSize: true
    });
    
    await browser.close();
    
    return {
      pdf_data: pdfBuffer.toString('base64'),
      file_size: pdfBuffer.length,
      page_count: 1, // You might need to analyze the PDF to get actual page count
      conversion_time_ms: 0,
      success: true
    };
    
  } catch (error) {
    console.error('Real PDF conversion failed:', error);
    return {
      pdf_data: '',
      file_size: 0,
      page_count: 0,
      conversion_time_ms: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Alternative: Use a cloud service for HTML to PDF conversion
async function convertHTMLToPDFWithService(htmlContent: string, title?: string): Promise<HTMLToPDFResponse> {
  try {
    // Example with a service like PDFShift (you'd need an API key)
    const PDFSHIFT_API_KEY = process.env.PDFSHIFT_API_KEY;
    
    if (!PDFSHIFT_API_KEY) {
      throw new Error('PDFShift API key not configured');
    }

    const response = await fetch('https://api.pdfshift.io/v3/convert/html', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PDFSHIFT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: htmlContent,
        format: 'A4',
        margin: '0.5in',
        title: title || 'Generated PDF'
      })
    });

    if (!response.ok) {
      throw new Error(`PDFShift API error: ${response.status} ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    
    return {
      pdf_data: Buffer.from(pdfBuffer).toString('base64'),
      file_size: pdfBuffer.byteLength,
      page_count: 1, // PDFShift might provide this in headers
      conversion_time_ms: 0,
      success: true
    };

  } catch (error) {
    console.error('PDF service conversion failed:', error);
    return {
      pdf_data: '',
      file_size: 0,
      page_count: 0,
      conversion_time_ms: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
