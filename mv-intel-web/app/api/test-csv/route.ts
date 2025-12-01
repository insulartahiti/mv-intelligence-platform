import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';


export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🧪 Testing CSV import...');
    
    // Test environment variables
    console.log('Environment check:', {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing',
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing'
    });
    
    // Test file access
    const csvPath = '/Users/harshgovil/mv-intelligence-platform/Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv';
    console.log('Checking file:', csvPath);
    
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({
        success: false,
        error: `File not found: ${csvPath}`
      });
    }
    
    // Test file reading
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    console.log(`File has ${lines.length} lines`);
    
    // Test database connection
    const { data, error } = await supabase
      .from('graph.entities')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        success: false,
        error: `Database error: ${error.message}`
      });
    }
    
    // Test CSV parsing (first few rows)
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('Headers:', headers.slice(0, 5));
    
    const firstRow = lines[1];
    if (firstRow) {
      const values = firstRow.split(',');
      console.log('First row values:', values.slice(0, 5));
    }
    
    return NextResponse.json({
      success: true,
      message: 'All tests passed',
      data: {
        fileLines: lines.length,
        headers: headers.slice(0, 5),
        databaseConnected: true
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    }, { status: 500 });
  }
}
