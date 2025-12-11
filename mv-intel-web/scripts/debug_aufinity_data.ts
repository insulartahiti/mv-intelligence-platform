import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uqptiychukuwixubrbat.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAufinityData() {
  console.log('=== Debugging Aufinity Financial Data ===\n');
  
  // 1. Find Aufinity entity
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio')
    .ilike('name', '%aufinity%');
  
  console.log('1. Aufinity Entities in graph.entities:');
  console.log(JSON.stringify(entities, null, 2));
  
  if (!entities || entities.length === 0) {
    console.log('No Aufinity entity found!');
    return;
  }
  
  const aufinity = entities.find(e => e.is_portfolio) || entities[0];
  const companyId = aufinity.id;
  console.log(`\nUsing entity: ${aufinity.name} (${companyId})\n`);
  
  // 2. Check dim_source_files
  console.log('2. dim_source_files for Aufinity:');
  const { data: sourceFiles, error: srcErr } = await supabase
    .from('dim_source_files')
    .select('*')
    .eq('company_id', companyId);
  
  if (srcErr) {
    console.log('Error querying dim_source_files:', srcErr);
  } else {
    console.log(`Found ${sourceFiles?.length || 0} source files:`);
    console.log(JSON.stringify(sourceFiles, null, 2));
  }
  
  // 3. Check fact_financials
  console.log('\n3. fact_financials for Aufinity:');
  const { data: facts, error: factsErr } = await supabase
    .from('fact_financials')
    .select('*')
    .eq('company_id', companyId)
    .limit(10);
  
  if (factsErr) {
    console.log('Error querying fact_financials:', factsErr);
  } else {
    console.log(`Found ${facts?.length || 0} fact records (showing first 10):`);
    console.log(JSON.stringify(facts, null, 2));
  }
  
  // 4. Check fact_metrics
  console.log('\n4. fact_metrics for Aufinity:');
  const { data: metrics, error: metricsErr } = await supabase
    .from('fact_metrics')
    .select('*')
    .eq('company_id', companyId)
    .limit(10);
  
  if (metricsErr) {
    console.log('Error querying fact_metrics:', metricsErr);
  } else {
    console.log(`Found ${metrics?.length || 0} metric records (showing first 10):`);
    console.log(JSON.stringify(metrics, null, 2));
  }
  
  // 5. Check for ANY data in fact_metrics (maybe wrong company_id used)
  console.log('\n5. Total records in fact_metrics (all companies):');
  const { data: allMetrics, count } = await supabase
    .from('fact_metrics')
    .select('company_id', { count: 'exact' });
  
  console.log(`Total fact_metrics records: ${count}`);
  const uniqueCompanies = [...new Set(allMetrics?.map(m => m.company_id))];
  console.log('Company IDs with metrics:', uniqueCompanies);
  
  // 6. Check portfolio_guides
  console.log('\n6. portfolio_guides for Aufinity:');
  const { data: guide, error: guideErr } = await supabase
    .from('portfolio_guides')
    .select('*')
    .eq('company_id', companyId);
  
  if (guideErr) {
    console.log('Error querying portfolio_guides:', guideErr);
  } else {
    console.log(`Found ${guide?.length || 0} guide(s):`);
    if (guide && guide.length > 0) {
      console.log('Guide updated_at:', guide[0].updated_at);
      console.log('YAML length:', guide[0].content_yaml?.length || 0, 'chars');
      console.log('First 500 chars of YAML:\n', guide[0].content_yaml?.substring(0, 500));
    }
  }
}

debugAufinityData().catch(console.error);
