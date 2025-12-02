import * as XLSX from 'xlsx';
import { FileMetadata } from './load_file';

export interface ExtractedSheet {
  sheetName: string;
  data: any[][]; // Row-major grid
  range: string; // e.g. "A1:Z100"
}

export async function parseExcel(file: FileMetadata): Promise<ExtractedSheet[]> {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const results: ExtractedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    // Get raw data with formulas parsed if possible, or just values
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    const range = worksheet['!ref'] || '';

    results.push({
      sheetName,
      data,
      range
    });
  }

  return results;
}

/**
 * Helper to get value from a specific cell address like "B5"
 */
export function getCellValue(sheet: ExtractedSheet, cellAddress: string): any {
  // Simple A1 parser
  const colMatch = cellAddress.match(/[A-Z]+/);
  const rowMatch = cellAddress.match(/\d+/);

  if (!colMatch || !rowMatch) return null;

  const colStr = colMatch[0];
  const rowIdx = parseInt(rowMatch[0], 10) - 1; // 1-based to 0-based
  const colIdx = colStrToIdx(colStr);

  if (rowIdx < 0 || rowIdx >= sheet.data.length) return null;
  const row = sheet.data[rowIdx];
  if (!row || colIdx >= row.length) return null;

  return row[colIdx];
}

function colStrToIdx(colStr: string): number {
  let idx = 0;
  for (let i = 0; i < colStr.length; i++) {
    idx = idx * 26 + (colStr.charCodeAt(i) - 64);
  }
  return idx - 1;
}


