import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { createHash } from 'crypto';

// Generate deterministic UUID from name + domain
function generateEntityId(name: string, domain?: string, type: 'organization' | 'person' = 'organization'): string {
  const input = `${type}:${name.toLowerCase()}:${domain || ''}`;
  const hash = createHash('sha256').update(input).digest('hex');
  
  // Convert to UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const hex = hash.substring(0, 32);
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing CSV parsing...');
    
    const csvPath = '/Users/harshgovil/mv-intelligence-platform/Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv';
    
    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({
        success: false,
        error: `File not found: ${csvPath}`
      });
    }
    
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    console.log(`📊 Found ${lines.length - 1} rows to process`);
    console.log('Headers:', headers.slice(0, 10));
    
    const allEntities: any[] = [];
    
    // Process first 3 rows only
    for (let i = 1; i <= 3; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV parsing
      const row: any = {};
      const values = line.split(',');
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      
      // Create organization entity
      const orgId = generateEntityId(row.Name, row.Website, 'organization');
      const org = {
        id: orgId,
        name: row.Name,
        type: 'organization',
        domain: row.Website || undefined,
        industry: row.Industries || undefined,
        pipeline_stage: row.Status || undefined,
        source: 'affinity_csv_import',
        metadata: {
          affinity_row_id: row['Affinity Row ID'],
          affinity_org_id: parseInt(row['Organization Id'])
        }
      };
      
      allEntities.push(org);
      
      console.log(`Row ${i}: ${row.Name} -> ${orgId}`);
    }
    
    return NextResponse.json({
      success: true,
      message: 'CSV parsing test completed',
      data: {
        totalLines: lines.length,
        processedEntities: allEntities.length,
        entities: allEntities
      }
    });
    
  } catch (error) {
    console.error('❌ CSV parsing test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    }, { status: 500 });
  }
}
