require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  console.log('Fetching sample (no filters)...')
  
  // Fetch any 5 rows
  const { data, error, count } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, business_analysis', { count: 'exact' })
    .limit(5)
    
  console.log('Total Count:', count)
  console.log('Sample data length:', data?.length)
  if (data && data.length > 0) {
    console.log('First Item:', JSON.stringify(data[0], null, 2))
  }
  console.log('Error:', error)

  // Fetch 5 NULL rows
  console.log('\nFetching NULL analysis rows...')
  const { data: nullData, error: nullError, count: nullCount } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name', { count: 'exact' })
    .is('business_analysis', null)
    .limit(5)

  console.log('Null Count:', nullCount)
  console.log('Null Sample:', nullData?.length)
}

test()