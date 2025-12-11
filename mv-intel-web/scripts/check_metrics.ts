import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uqptiychukuwixubrbat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg'
);

async function check() {
  console.log('=== Checking fact_metrics ===\n');
  
  // Query all metrics
  const { data: allMetrics, error: allErr } = await supabase
    .from('fact_metrics')
    .select('id, company_id, period, metric_id, value')
    .limit(20);
  
  if (allErr) {
    console.error('Error:', allErr);
    return;
  }
  
  console.log(`Total metrics found: ${allMetrics?.length || 0}`);
  console.log(JSON.stringify(allMetrics, null, 2));
  
  // Query specifically for Aufinity
  const aufinity_id = '146f9f94-0fc0-95ad-f0e9-2f1f2d31f020';
  console.log(`\n=== Checking for Aufinity (${aufinity_id}) ===`);
  
  const { data: aufMetrics, error: aufErr } = await supabase
    .from('fact_metrics')
    .select('*')
    .eq('company_id', aufinity_id);
  
  if (aufErr) {
    console.error('Error:', aufErr);
  } else {
    console.log(`Aufinity metrics: ${aufMetrics?.length || 0}`);
    console.log(JSON.stringify(aufMetrics, null, 2));
  }
  
  // Check fact_financials count
  console.log('\n=== Checking fact_financials ===');
  const { data: facts, count } = await supabase
    .from('fact_financials')
    .select('company_id', { count: 'exact' })
    .eq('company_id', aufinity_id);
  
  console.log(`Aufinity fact_financials count: ${count}`);
}

check().catch(console.error);
