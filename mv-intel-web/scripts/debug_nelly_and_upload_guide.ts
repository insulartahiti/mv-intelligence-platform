import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Debugging Nelly Entity ---');
  
  // 1. Fetch Nelly Entity
  const { data: entities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('*')
    .ilike('name', '%Nelly Solutions%'); // Specific match

  if (error) {
    console.error('Error fetching entity:', error);
    return;
  }

  if (!entities || entities.length === 0) {
    console.log('No entity found for Nelly Solutions');
    return;
  }

  const nelly = entities[0];
  console.log(`Found entity: ${nelly.name} (${nelly.id})`);
  console.log('brief_description:', nelly.brief_description);
  console.log('ai_summary:', nelly.ai_summary);
  console.log('enrichment_data (keys):', nelly.enrichment_data ? Object.keys(nelly.enrichment_data) : 'null');
  console.log('business_analysis (keys):', nelly.business_analysis ? Object.keys(nelly.business_analysis) : 'null');
  
  if (nelly.enrichment_data) {
      console.log('enrichment_data.description:', nelly.enrichment_data.description);
  }
  if (nelly.business_analysis) {
      console.log('business_analysis.core_business:', nelly.business_analysis.core_business);
  }

  // 2. Upload Guide
  console.log('\n--- Uploading Guide ---');
  const guidePath = path.join(process.cwd(), 'lib/financials/portcos/nelly/guide.yaml');
  
  if (!fs.existsSync(guidePath)) {
    console.error('Guide file not found at:', guidePath);
    return;
  }

  const yamlContent = fs.readFileSync(guidePath, 'utf8');
  console.log(`Read guide (${yamlContent.length} bytes)`);

  // Upsert into portfolio_guides
  // We need to check if a guide exists for this company_id or insert new
  // Table schema: id, company_id, content_yaml, created_at, updated_at
  
  const { data: existingGuide, error: guideError } = await supabase
    .from('portfolio_guides')
    .select('id')
    .eq('company_id', nelly.id)
    .single();

  if (guideError && guideError.code !== 'PGRST116') { // PGRST116 is "Row not found"
     console.error('Error checking existing guide:', guideError);
  }

  let result;
  if (existingGuide) {
      console.log('Updating existing guide...');
      result = await supabase
        .from('portfolio_guides')
        .update({ 
            content_yaml: yamlContent,
            updated_at: new Date().toISOString()
        })
        .eq('id', existingGuide.id);
  } else {
      console.log('Inserting new guide...');
      result = await supabase
        .from('portfolio_guides')
        .insert({
            company_id: nelly.id,
            content_yaml: yamlContent
        });
  }

  if (result.error) {
      console.error('Error saving guide:', result.error);
  } else {
      console.log('Guide saved successfully!');
  }
}

main();
