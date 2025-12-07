import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: 'mv-intel-web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPipelineData() {
  console.log('Checking pipeline stages for entities with is_portfolio=true...');

  const { data, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, pipeline_stage, is_portfolio, fund')
    .eq('is_portfolio', true)
    .in('pipeline_stage', ['Passed', 'Watchlist', '1. New', 'Lost', 'Rejected'])
    .limit(20);

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  console.log(`Found ${data.length} entities marked as portfolio but with non-portfolio stages:`);
  data.forEach(e => {
    console.log(`- ${e.name} (${e.id}): Stage='${e.pipeline_stage}', Fund='${e.fund}'`);
  });
  
  // Also check distinct pipeline stages for ALL portfolio entities to see what we're dealing with
  const { data: stages, error: stageError } = await supabase
    .schema('graph')
    .from('entities')
    .select('pipeline_stage')
    .eq('is_portfolio', true);
    
  if (!stageError && stages) {
      const uniqueStages = [...new Set(stages.map(s => s.pipeline_stage))];
      console.log('\nUnique pipeline stages for is_portfolio=true entities:', uniqueStages);
  }
}

checkPipelineData();
