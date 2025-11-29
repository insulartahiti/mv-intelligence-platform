import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
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

    console.log(`Processing LinkedIn CSV file: ${file.name}`);

    // Process the file directly
    const arrayBuffer = await file.arrayBuffer();
    const csvContent = Buffer.from(arrayBuffer).toString('utf-8');
    
    // Parse CSV content
    const { parse } = require('csv-parse/sync');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`Found ${records.length} LinkedIn connections`);

    // Process connections
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let domainMatches = 0;
    let newEntities = 0;
    let updatedEntities = 0;

    for (const record of records) {
      const name = `${record['First Name']} ${record['Last Name']}`.trim();
      const company = record['Company'] || '';
      const position = record['Position'] || '';
      const email = record['Email Address'] || '';
      const linkedinUrl = record['URL'] || '';
      const connectedOn = record['Connected On'] || '';

      if (!name) continue;

      try {
        // Check if person already exists
        const existingResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/entities?name=ilike.${encodeURIComponent(name)}&type=eq.person&select=*`, {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            'Content-Type': 'application/json',
            'Accept-Profile': 'graph'
          }
        });

        const existingEntities = await existingResponse.json();
        
        if (existingEntities.length > 0) {
          // Update existing entity
          const entity = existingEntities[0];
          const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/entities?id=eq.${entity.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
              'Content-Type': 'application/json',
              'Accept-Profile': 'graph'
            },
            body: JSON.stringify({
              linkedin_first_degree: true,
              linkedin_url: linkedinUrl,
              updated_at: new Date().toISOString()
            })
          });

          if (updateResponse.ok) {
            updatedEntities++;
            exactMatches++;
          }
        } else {
          // Create new entity
          const domain = email ? email.split('@')[1] : undefined;
          const entityId = require('crypto').randomUUID();
          
          const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/entities`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
              'Content-Type': 'application/json',
              'Accept-Profile': 'graph'
            },
            body: JSON.stringify({
              id: entityId,
              name: name,
              type: 'person',
              domain: domain,
              linkedin_url: linkedinUrl,
              linkedin_first_degree: true,
              enrichment_data: {
                linkedin: {
                  company: company,
                  position: position,
                  connected_on: connectedOn
                }
              },
              source: 'linkedin_import',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          });

          if (createResponse.ok) {
            newEntities++;
          }
        }
      } catch (error) {
        console.error(`Error processing connection ${name}:`, error);
      }
    }

    const report = {
      total_connections: records.length,
      exact_matches: exactMatches,
      fuzzy_matches: fuzzyMatches,
      domain_matches: domainMatches,
      new_entities_created: newEntities,
      updated_existing: updatedEntities,
      processing_summary: {
        updated_existing: updatedEntities,
        created_new: newEntities,
        total_processed: records.length
      }
    };

    console.log('LinkedIn import completed successfully');

    return NextResponse.json({
      success: true,
      message: 'LinkedIn data imported successfully',
      report
    });

  } catch (error) {
    console.error('LinkedIn import error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `LinkedIn import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        report: null
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Return LinkedIn import statistics
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/linkedin_connections?select=*`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
        'Accept-Profile': 'graph'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch LinkedIn connections: ${response.status}`);
    }

    const connections = await response.json();

    // Get entities with LinkedIn data
    const entitiesResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/entities?linkedin_first_degree=eq.true&select=id`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
        'Accept-Profile': 'graph'
      }
    });

    const linkedinEntities = await entitiesResponse.json();

    const stats = {
      total_connections: connections.length,
      linkedin_entities: linkedinEntities.length,
      last_import: connections.length > 0 ? 
        new Date(Math.max(...connections.map((c: any) => new Date(c.created_at).getTime()))).toISOString() : 
        null
    };

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching LinkedIn stats:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to fetch LinkedIn stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: null
      },
      { status: 500 }
    );
  }
}
