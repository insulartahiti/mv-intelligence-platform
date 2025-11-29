import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting CSV debug...');
    
    // Read CSV file
    const csvPath = path.join(process.cwd(), '..', 'Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv');
    console.log('CSV path:', csvPath);
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    console.log('CSV content length:', csvContent.length);
    
    // Parse CSV - only first 3 rows
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      to: 3
    });

    console.log(`Parsed ${records.length} rows`);
    console.log('First record keys:', Object.keys(records[0] || {}));
    console.log('First record sample:', {
      Name: (records[0] as any)?.Name,
      Website: (records[0] as any)?.Website,
      Status: (records[0] as any)?.Status
    });

    return NextResponse.json({
      success: true,
      message: 'CSV debug completed',
      result: {
        totalRows: records.length,
        firstRecord: records[0],
        allKeys: Object.keys(records[0] || {})
      }
    });
  } catch (error) {
    console.error('CSV debug failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
