import * as XLSX from 'xlsx';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

interface ExcelSnippetOptions {
  padding?: number; // Number of rows/cols around the target
}

/**
 * Generate an HTML representation of an Excel range with highlighting
 */
export function generateExcelHtml(
  workbook: XLSX.WorkBook,
  sheetName: string,
  targetCell: string, // e.g., "B4"
  options: ExcelSnippetOptions = {}
): string {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);

  const padding = options.padding ?? 5;
  
  // Parse target cell
  const cellRef = XLSX.utils.decode_cell(targetCell);
  
  // Determine range
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  const startRow = Math.max(range.s.r, cellRef.r - padding);
  const endRow = Math.min(range.e.r, cellRef.r + padding);
  const startCol = Math.max(range.s.c, cellRef.c - padding);
  const endCol = Math.min(range.e.c, cellRef.c + padding);
  
  // Build HTML Table
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; background: white; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 10px; }
        th, td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: right; }
        th { background: #f5f5f5; color: #666; font-weight: normal; text-align: center; }
        .row-header { background: #f5f5f5; color: #666; font-weight: normal; text-align: center; width: 40px; }
        .highlight { background: #e6f3ff; border: 2px solid #3b82f6; font-weight: bold; }
        .label-cell { text-align: left; }
        .header-context { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 5px; }
        .sheet-badge { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #666; margin-left: 10px; }
      </style>
    </head>
    <body>
      <div class="header-context">
        Target: <span style="color: #3b82f6">${targetCell}</span>
        <span class="sheet-badge">${sheetName}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="row-header"></th>
            ${Array.from({ length: endCol - startCol + 1 }, (_, i) => {
              const colIdx = startCol + i;
              return `<th>${XLSX.utils.encode_col(colIdx)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  for (let r = startRow; r <= endRow; r++) {
    html += `<tr><td class="row-header">${r + 1}</td>`;
    for (let c = startCol; c <= endCol; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      const isTarget = r === cellRef.r && c === cellRef.c;
      
      let content = '';
      if (cell) {
        // Format value
        content = cell.w || cell.v || '';
      }
      
      // Heuristic: Text in first few columns is likely a label
      const isLabel = c <= range.s.c + 1 || (cell && cell.t === 's');
      
      html += `<td class="${isTarget ? 'highlight' : ''} ${isLabel ? 'label-cell' : ''}">${content}</td>`;
    }
    html += '</tr>';
  }
  
  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Generate a screenshot image of the Excel snippet
 * Uses Puppeteer (local or serverless)
 */
export async function generateExcelSnippetImage(
  workbook: XLSX.WorkBook,
  sheetName: string,
  targetCell: string
): Promise<Buffer> {
  const html = generateExcelHtml(workbook, sheetName, targetCell);
  
  // Determine environment
  const isLocal = !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL;
  
  let browser;
  try {
    if (isLocal) {
        // Local development: use standard puppeteer launch (or core if configured)
        // We'll try to find a local chrome executable
        const executablePath = process.platform === 'darwin' 
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : undefined; // Let puppeteer find it on linux/win
            
        browser = await puppeteer.launch({
            executablePath, 
            channel: 'chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true
        });
    } else {
        // Serverless: use sparticuz/chromium
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }
    
    const page = await browser.newPage();
    await page.setContent(html);
    
    // Resize viewport to fit content
    const bodyHandle = await page.$('body');
    const { width, height } = await bodyHandle!.boundingBox() || { width: 800, height: 600 };
    await page.setViewport({ width: Math.ceil(width), height: Math.ceil(height) });
    
    const buffer = await page.screenshot({ type: 'png', fullPage: true });
    
    await browser.close();
    return buffer as Buffer;
    
  } catch (err) {
    if (browser) await browser.close();
    console.error('Excel screenshot failed:', err);
    throw err;
  }
}

