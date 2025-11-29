import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// Types for CSV data
interface AffinityCSVRow {
  'Affinity Row ID': string;
  'Organization Id': string;
  'Name': string;
  'Website': string;
  'People': string;
  'Status': string;
  'Date Added': string;
  'Next Meeting': string;
  'Owners': string;
  'Deal team': string;
  'Total Investment Amount': string;
  'Pre-Money Valuation': string;
  'Location (City)': string;
  'Location (Country)': string;
  'Last Email': string;
  'Last Meeting': string;
  'Reminders': string;
  'Comments/Decision': string;
  'Source of Intro': string;
  'Source of Introduction (Organisation)': string;
  'Source of Introduction (Person)': string;
  'Urgency': string;
  'Series': string;
  'Founder Gender': string;
  'Pass/lost reason': string;
  'Sourced by (Full Name)': string;
  'Sourced by (Email)': string;
  'Notion Page': string;
  'Related Deals': string;
  'Number of Employees': string;
  'Industries': string;
  'LinkedIn Profile (Founders/CEOs)': string;
  'Description': string;
  'Fund': string;
  'Current Round Investment Amount': string;
  'Year Founded': string;
  'Taxonomy': string;
  'Taxonomy Subcategory': string;
  'Brief Description': string;
  'Apollo taxonomy': string;
}

interface ParsedEntity {
  id: string;
  name: string;
  type: 'person' | 'organization';
  domain?: string;
  brief_description?: string;
  source: string;
  // Organization fields
  pipeline_stage?: string;
  fund?: string;
  taxonomy?: string;
  taxonomy_subcategory?: string;
  valuation_amount?: number;
  investment_amount?: number;
  year_founded?: number;
  employee_count?: number;
  location_city?: string;
  location_country?: string;
  urgency?: string;
  series?: string;
  founder_gender?: string;
  pass_lost_reason?: string;
  sourced_by?: string;
  notion_page?: string;
  related_deals?: string;
  apollo_taxonomy?: string;
  affinity_org_id?: string;
  linkedin_url?: string;
}

interface ParsedEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score?: number;
}

// Generate deterministic UUID for entities
function generateEntityId(name: string, type: string, domain?: string): string {
  const input = `${name}-${type}-${domain || ''}`;
  const hash = require('crypto').createHash('md5').update(input).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

// Parse a single CSV row into entities and edges
function parseCSVRow(row: AffinityCSVRow): { entities: ParsedEntity[], edges: ParsedEdge[] } {
  const entities: ParsedEntity[] = [];
  const edges: ParsedEdge[] = [];

  // Create organization entity
  const orgEntity: ParsedEntity = {
    id: generateEntityId(row.Name, 'organization', row.Website),
    name: row.Name,
    type: 'organization',
    domain: row.Website || undefined,
    brief_description: row['Brief Description'] || row.Description || undefined,
    source: 'affinity_csv_import',
    pipeline_stage: row.Status,
    fund: row.Fund,
    taxonomy: row.Taxonomy,
    taxonomy_subcategory: row['Taxonomy Subcategory'],
    valuation_amount: row['Pre-Money Valuation'] ? parseFloat(row['Pre-Money Valuation'].replace(/[^0-9.-]/g, '')) : undefined,
    investment_amount: row['Total Investment Amount'] ? parseFloat(row['Total Investment Amount'].replace(/[^0-9.-]/g, '')) : undefined,
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
    related_deals: row['Related Deals'] || undefined,
    apollo_taxonomy: row['Apollo taxonomy'] || undefined,
    affinity_org_id: row['Organization Id'],
  };

  entities.push(orgEntity);

  // Parse people from various fields
  const peopleFields = [
    { field: row.People, type: 'contact' },
    { field: row.Owners, type: 'owner' },
    { field: row['Deal team'], type: 'deal_team' },
    { field: row['Source of Introduction (Person)'], type: 'intro_source' },
    { field: row['LinkedIn Profile (Founders/CEOs)'], type: 'founder' }
  ];

  for (const { field, type } of peopleFields) {
    if (!field) continue;

    // Split by common delimiters and clean up
    const people = field.split(/[,;]/).map(p => p.trim()).filter(p => p && p !== '');
    
    for (const personStr of people) {
      // Extract name and email from format like "Name <email@domain.com>"
      const emailMatch = personStr.match(/^(.+?)\s*<(.+?)>$/);
      const name = emailMatch ? emailMatch[1].trim() : personStr;
      const email = emailMatch ? emailMatch[2].trim() : undefined;
      
      if (name) {
        const personEntity: ParsedEntity = {
          id: generateEntityId(name, 'person', email),
          name: name,
          type: 'person',
          domain: email ? email.split('@')[1] : undefined,
          source: 'affinity_csv_import',
        };

        entities.push(personEntity);

        // Create edge between person and organization
        const edgeId = generateEntityId(`${name}-${row.Name}`, 'edge', type);
        const edge: ParsedEdge = {
          id: edgeId,
          source: personEntity.id,
          target: orgEntity.id,
          kind: type,
          strength_score: type === 'owner' ? 0.9 : type === 'deal_team' ? 0.8 : 0.5,
        };

        edges.push(edge);
      }
    }
  }

  return { entities, edges };
}

export async function POST(request: NextRequest) {
  try {
    console.log('Starting Affinity CSV import...');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a file upload request
    const contentType = request.headers.get('content-type');
    
    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { success: false, message: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type
      if (!file.name.endsWith('.csv')) {
        return NextResponse.json(
          { success: false, message: 'File must be a CSV file' },
          { status: 400 }
        );
      }

      console.log(`Processing uploaded CSV file: ${file.name}`);

      // Process the uploaded file
      const arrayBuffer = await file.arrayBuffer();
      const csvContent = Buffer.from(arrayBuffer).toString('utf-8');
      
      // Parse CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      }) as AffinityCSVRow[];

      console.log(`Found ${records.length} rows in uploaded CSV`);

      // Parse all rows
      const allEntities: ParsedEntity[] = [];
      const allEdges: ParsedEdge[] = [];

      for (const row of records) {
        const { entities, edges } = parseCSVRow(row);
        allEntities.push(...entities);
        allEdges.push(...edges);
      }

      // Deduplicate entities by ID
      const entityMap = new Map<string, ParsedEntity>();
      for (const entity of allEntities) {
        if (!entityMap.has(entity.id)) {
          entityMap.set(entity.id, entity);
        }
      }

      const uniqueEntities = Array.from(entityMap.values());
      const uniqueEdges = allEdges.filter(edge => 
        uniqueEntities.some(e => e.id === edge.source) && 
        uniqueEntities.some(e => e.id === edge.target)
      );

      console.log(`Parsed ${uniqueEntities.length} unique entities and ${uniqueEdges.length} edges`);

      // Insert entities one by one to avoid batch issues
      console.log('Inserting entities...');
      for (const entity of uniqueEntities) {
        const { error } = await supabase
          .schema('graph')
          .from('entities')
          .upsert(entity, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to insert entity ${entity.name}:`, error);
        }
      }

      // Insert edges one by one
      console.log('Inserting edges...');
      for (const edge of uniqueEdges) {
        const { error } = await supabase
          .schema('graph')
          .from('edges')
          .upsert(edge, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to insert edge ${edge.id}:`, error);
        }
      }

      console.log('Import completed successfully!');
      
      return NextResponse.json({
        success: true,
        message: 'CSV import completed successfully',
        result: {
          entities: uniqueEntities.length,
          edges: uniqueEdges.length,
          organizations: uniqueEntities.filter(e => e.type === 'organization').length,
          people: uniqueEntities.filter(e => e.type === 'person').length,
        }
      });
    } else {
      // Handle JSON request (fallback to hardcoded file)
      const csvPath = require('path').join(process.cwd(), '..', 'Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv');
      const csvContent = require('fs').readFileSync(csvPath, 'utf-8');
      
      // Parse CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      }) as AffinityCSVRow[];

      console.log(`Found ${records.length} rows in hardcoded CSV`);

      // Parse all rows
      const allEntities: ParsedEntity[] = [];
      const allEdges: ParsedEdge[] = [];

      for (const row of records) {
        const { entities, edges } = parseCSVRow(row);
        allEntities.push(...entities);
        allEdges.push(...edges);
      }

      // Deduplicate entities by ID
      const entityMap = new Map<string, ParsedEntity>();
      for (const entity of allEntities) {
        if (!entityMap.has(entity.id)) {
          entityMap.set(entity.id, entity);
        }
      }

      const uniqueEntities = Array.from(entityMap.values());
      const uniqueEdges = allEdges.filter(edge => 
        uniqueEntities.some(e => e.id === edge.source) && 
        uniqueEntities.some(e => e.id === edge.target)
      );

      console.log(`Parsed ${uniqueEntities.length} unique entities and ${uniqueEdges.length} edges`);

      // Insert entities one by one
      console.log('Inserting entities...');
      for (const entity of uniqueEntities) {
        const { error } = await supabase
          .schema('graph')
          .from('entities')
          .upsert(entity, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to insert entity ${entity.name}:`, error);
        }
      }

      // Insert edges one by one
      console.log('Inserting edges...');
      for (const edge of uniqueEdges) {
        const { error } = await supabase
          .schema('graph')
          .from('edges')
          .upsert(edge, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to insert edge ${edge.id}:`, error);
        }
      }

      console.log('Import completed successfully!');
      
      return NextResponse.json({
        success: true,
        message: 'CSV import completed successfully',
        result: {
          entities: uniqueEntities.length,
          edges: uniqueEdges.length,
          organizations: uniqueEntities.filter(e => e.type === 'organization').length,
          people: uniqueEntities.filter(e => e.type === 'person').length,
        }
      });
    }
  } catch (error) {
    console.error('CSV import failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}