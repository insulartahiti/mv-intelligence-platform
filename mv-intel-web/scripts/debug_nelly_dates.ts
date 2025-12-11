import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uqptiychukuwixubrbat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg'
);

async function debugNellyDates() {
  console.log('=== Debugging Nelly Financial Data ===\n');
  
  // Find Nelly entity - use exact ID for the known Nelly portfolio company
  const nellyId = '6d3eb33f-afe0-46c3-8e00-3f59c62f9dc4';
  
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio')
    .eq('id', nellyId);
  
  console.log('Nelly entity:', entities);
  
  if (!entities || entities.length === 0) return;
  
  const nelly = entities[0];
  console.log(`\nUsing: ${nelly.name} (${nelly.id})\n`);
  
  // Get all unique dates and their counts
  const { data: facts } = await supabase
    .from('fact_financials')
    .select('date, scenario, line_item_id, source_file_id')
    .eq('company_id', nelly.id)
    .order('date', { ascending: false });
  
  console.log(`Total fact_financials: ${facts?.length || 0}`);
  
  // Group by date to see duplicates
  const dateCounts: Record<string, { actuals: number; budget: number; total: number }> = {};
  facts?.forEach(f => {
    const d = f.date;
    if (!dateCounts[d]) dateCounts[d] = { actuals: 0, budget: 0, total: 0 };
    dateCounts[d].total++;
    if (f.scenario?.toLowerCase() === 'actual') dateCounts[d].actuals++;
    else dateCounts[d].budget++;
  });
  
  console.log('\nDate distribution:');
  Object.entries(dateCounts)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 20)
    .forEach(([date, counts]) => {
      console.log(`  ${date}: ${counts.total} records (${counts.actuals} actuals, ${counts.budget} budget)`);
    });
  
  // Check source files
  const { data: sourceFiles } = await supabase
    .from('dim_source_files')
    .select('id, filename, ingested_at')
    .eq('company_id', nelly.id)
    .order('ingested_at', { ascending: false });
  
  console.log('\nSource files:');
  sourceFiles?.forEach(f => {
    console.log(`  ${f.filename} (${f.ingested_at})`);
  });
  
  // Check for line item duplicates within same date
  const lineItemDupes: Record<string, string[]> = {};
  facts?.forEach(f => {
    const key = `${f.date}|${f.scenario}|${f.line_item_id}`;
    if (!lineItemDupes[key]) lineItemDupes[key] = [];
    lineItemDupes[key].push(f.source_file_id);
  });
  
  const duplicates = Object.entries(lineItemDupes).filter(([_, files]) => files.length > 1);
  console.log(`\nDuplicate (date+scenario+line_item) entries: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('Sample duplicates:');
    duplicates.slice(0, 5).forEach(([key, files]) => {
      console.log(`  ${key}: ${files.length} records from files: ${[...new Set(files)].join(', ')}`);
    });
  }
}

debugNellyDates().catch(console.error);
