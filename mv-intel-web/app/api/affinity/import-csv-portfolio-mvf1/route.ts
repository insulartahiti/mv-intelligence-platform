import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
  auth: { persistSession: false } 
});

// Portfolio MVF1 organizations from your CSV data
const PORTFOLIO_MVF1_ORGS = [
  { name: "Artifact AI", domain: "artifactai.com" },
  { name: "Warren", domain: "warren.be" },
  { name: "Octaura", domain: "octaura.com" },
  { name: "Synthera.ai", domain: "synthera.ai" },
  { name: "Zocks", domain: "zocks.io" },
  { name: "ARS", domain: "arsfinancial.com" },
  { name: "Valstro", domain: "valstro.com" },
  { name: "DoorFeed", domain: "doorfeed.com" },
  { name: "Corastone (ATAP / prev. iownit)", domain: "iownit.us" },
  { name: "Xaver", domain: "xaver.com" },
  { name: "Aeropay", domain: "aeropay.com" },
  { name: "Airtable", domain: "airtable.com" },
  { name: "Alchemy", domain: "alchemy.com" },
  { name: "Alto Pharmacy", domain: "alto.com" },
  { name: "Amplify", domain: "amplify.com" },
  { name: "Anchorage", domain: "anchorage.com" },
  { name: "Anduril", domain: "anduril.com" },
  { name: "Anthropic", domain: "anthropic.com" },
  { name: "Apollo", domain: "apollo.io" },
  { name: "Archetype", domain: "archetype.com" },
  { name: "Aurora", domain: "aurora.tech" },
  { name: "Bolt", domain: "bolt.com" },
  { name: "Brex", domain: "brex.com" },
  { name: "Chainalysis", domain: "chainalysis.com" },
  { name: "Circle", domain: "circle.com" },
  { name: "Coinbase", domain: "coinbase.com" },
  { name: "Databricks", domain: "databricks.com" },
  { name: "Discord", domain: "discord.com" },
  { name: "Figma", domain: "figma.com" },
  { name: "GitHub", domain: "github.com" },
  { name: "Notion", domain: "notion.so" },
  { name: "OpenAI", domain: "openai.com" }
];

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Starting CSV-based Portfolio MVF1 import...');

    const results = {
      total: PORTFOLIO_MVF1_ORGS.length,
      imported: 0,
      updated: 0,
      errors: 0,
      organizations: [] as any[]
    };

    // Process each organization from the CSV data
    for (const org of PORTFOLIO_MVF1_ORGS) {
      try {
        // First check if organization already exists
        const { data: existing } = await supabase
          .from('companies')
          .select('id, name')
          .eq('name', org.name)
          .single();

        let data, error;
        
        if (existing) {
          // Update existing organization
          const result = await supabase
            .from('companies')
            .update({
              domain: org.domain,
              last_synced_at: new Date().toISOString(),
              tags: ['Motive Ventures Pipeline', 'Portfolio MVF1', 'CSV Import']
            })
            .eq('id', existing.id)
            .select()
            .single();
          data = result.data;
          error = result.error;
        } else {
          // Insert new organization
          const result = await supabase
            .from('companies')
            .insert({
              name: org.name,
              domain: org.domain,
              last_synced_at: new Date().toISOString(),
              tags: ['Motive Ventures Pipeline', 'Portfolio MVF1', 'CSV Import']
            })
            .select()
            .single();
          data = result.data;
          error = result.error;
        }

        if (error) {
          console.error(`Error upserting organization ${org.name}:`, error);
          console.error(`Error details:`, JSON.stringify(error, null, 2));
          results.errors++;
        } else if (data) {
          if (data.created_at === data.updated_at) {
            results.imported++;
          } else {
            results.updated++;
          }
          results.organizations.push({
            id: data.id,
            name: data.name,
            domain: data.domain
          });
          console.log(`✅ Processed: ${org.name}`);
        }
      } catch (error) {
        console.error(`Error processing ${org.name}:`, error);
        results.errors++;
      }
    }

    console.log('✅ CSV Portfolio MVF1 import completed:', results);

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${results.imported} new and updated ${results.updated} Portfolio MVF1 organizations from CSV data`,
      results: results
    });

  } catch (error) {
    console.error('❌ CSV Portfolio MVF1 import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
