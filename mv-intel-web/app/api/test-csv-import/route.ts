import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read CSV file
    const csvPath = path.join(process.cwd(), '..', 'Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse CSV - only first 5 rows for testing
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      to: 5 // Only process first 5 rows
    });

    console.log(`Processing ${records.length} test rows from CSV`);

    // Simple entity creation for testing
    const testEntities = records.map((row: any, index: number) => ({
      id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      name: row.Name || `Test Organization ${index}`,
      type: 'organization',
      domain: row.Website || undefined,
      brief_description: row['Brief Description'] || row.Description || undefined,
      source: 'test_csv_import',
      pipeline_stage: row.Status,
      fund: row.Fund,
      taxonomy: row.Taxonomy,
      affinity_org_id: row['Organization Id'],
    }));

    // Insert test entities
    console.log('Inserting test entities...');
    const { error: entitiesError } = await supabase
      .schema('graph')
      .from('entities')
      .upsert(testEntities, { onConflict: 'id' });

    if (entitiesError) {
      throw new Error(`Failed to insert entities: ${entitiesError.message}`);
    }

    console.log('Test import completed successfully!');
    return NextResponse.json({
      success: true,
      message: 'Test CSV import completed successfully',
      result: {
        entities: testEntities.length,
        organizations: testEntities.length,
        people: 0,
        edges: 0
      }
    });
  } catch (error) {
    console.error('Test CSV import failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
