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
 * Helper to get value from a specific cell address like "B5" or "b5"
 */
export function getCellValue(sheet: ExtractedSheet, cellAddress: string): any {
  // Normalize to uppercase for consistent parsing
  const normalizedAddress = cellAddress.toUpperCase();
  
  // Simple A1 parser (case-insensitive via normalization)
  const colMatch = normalizedAddress.match(/[A-Z]+/);
  const rowMatch = normalizedAddress.match(/\d+/);

  if (!colMatch || !rowMatch) {
    console.warn(`[Excel] Invalid cell address format: ${cellAddress}`);
    return null;
  }

  const colStr = colMatch[0];
  const rowIdx = parseInt(rowMatch[0], 10) - 1; // 1-based to 0-based
  const colIdx = colStrToIdx(colStr);

  if (rowIdx < 0 || rowIdx >= sheet.data.length) return null;
  const row = sheet.data[rowIdx];
  if (!row || colIdx >= row.length) return null;

  return row[colIdx];
}

function colStrToIdx(colStr: string): number {
  // colStr is already uppercase from normalization
  let idx = 0;
  for (let i = 0; i < colStr.length; i++) {
    idx = idx * 26 + (colStr.charCodeAt(i) - 64); // 'A' is 65, so 'A'-64=1
  }
  return idx - 1;
}


