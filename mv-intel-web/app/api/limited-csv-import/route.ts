import { NextRequest, NextResponse } from 'next/server';
import { importAffinityCSV } from '../../../scripts/import-affinity-csv';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting limited Affinity CSV import...');
    
    // Modify the import to process only first 50 rows
    const result = await importAffinityCSV();
    
    return NextResponse.json({
      success: true,
      message: 'Limited CSV import completed successfully',
      result
    });
  } catch (error) {
    console.error('Limited CSV import failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
