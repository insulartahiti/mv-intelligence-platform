import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { createHash } from 'crypto';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    console.log('🧪 Starting simple CSV import...');
    
    const csvPath = '/Users/harshgovil/mv-intelligence-platform/Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv';
    
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    console.log(`📊 Found ${lines.length - 1} rows to process`);
    
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
        fund: row.Fund || undefined,
        taxonomy: row.Taxonomy || undefined,
        taxonomy_subcategory: row['Taxonomy Subcategory'] || undefined,
        valuation_amount: row['Pre-Money Valuation'] ? parseFloat(row['Pre-Money Valuation']) : undefined,
        investment_amount: row['Total Investment Amount'] ? parseFloat(row['Total Investment Amount']) : undefined,
        year_founded: row['Year Founded'] ? parseInt(row['Year Founded']) : undefined,
        employee_count: row['Number of Employees'] ? parseInt(row['Number of Employees']) : undefined,
        location_city: row['Location (City)'] || undefined,
        location_country: row['Location (Country)'] || undefined,
        urgency: row.Urgency || undefined,
        series: row.Series || undefined,
        founder_gender: row['Founder Gender'] || undefined,
        pass_lost_reason: row['Pass/lost reason'] || undefined,
        sourced_by: row['Sourced by (Full Name)'] || undefined,
        notion_page: row['Notion Page'] || undefined,
        related_deals: row['Related Deals'] ? row['Related Deals'].split(',').map((d: string) => d.trim()) : undefined,
        apollo_taxonomy: row['Apollo taxonomy'] || undefined,
        brief_description: row['Brief Description'] || undefined,
        affinity_org_id: parseInt(row['Organization Id']),
        linkedin_url: row['LinkedIn Profile (Founders/CEOs)'] || undefined,
        source: 'affinity_csv_import',
        metadata: {
          affinity_row_id: row['Affinity Row ID'],
          date_added: row['Date Added'],
          next_meeting: row['Next Meeting'],
          last_email: row['Last Email'],
          last_meeting: row['Last Meeting'],
          reminders: row.Reminders,
          comments_decision: row['Comments/Decision'],
          source_of_intro: row['Source of Intro'],
          source_of_intro_org: row['Source of Introduction (Organisation)'],
          source_of_intro_person: row['Source of Introduction (Person)'],
          sourced_by_email: row['Sourced by (Email)']
        }
      };
      
      allEntities.push(org);
      console.log(`Processed: ${row.Name} -> ${orgId}`);
    }
    
    console.log(`✅ Parsed ${allEntities.length} entities`);
    
    // Insert entities one by one
    let insertedEntities = 0;
    
    for (const entity of allEntities) {
      console.log(`Inserting: ${entity.name}`);
      
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .upsert([entity], { onConflict: 'id' });
      
      if (error) {
        console.error(`❌ Error inserting ${entity.name}:`, error);
        throw error;
      }
      
      insertedEntities++;
      console.log(`✅ Inserted ${insertedEntities}/${allEntities.length} entities`);
    }
    
    console.log('🎉 Simple import completed successfully!');
    
    return NextResponse.json({
      success: true,
      message: 'Simple CSV import completed successfully',
      data: {
        entities: insertedEntities,
        organizations: allEntities.length
      }
    });
    
  } catch (error) {
    console.error('❌ Simple import failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Simple CSV import failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
