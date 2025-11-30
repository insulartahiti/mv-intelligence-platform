const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createSearchFunction() {
    console.log('📝 Creating search_entities function in Supabase...\n');

    const sql = `
-- Create RPC function for semantic search
CREATE OR REPLACE FUNCTION search_entities(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  similarity float,
  domain text,
  industry text,
  pipeline_stage text,
  taxonomy jsonb,
  ai_summary text,
  importance float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.taxonomy,
    e.ai_summary,
    e.importance
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
  `;

    try {
        const { data, error } = await supabase.rpc('exec_sql', { query: sql });

        if (error) {
            console.error('❌ Error (trying dashboard):', error.message);
            console.log('\n⚠️  Please run this SQL in Supabase SQL Editor:\n');
            console.log(sql);
            process.exit(1);
        }

        console.log('✅ Function created successfully!');
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        console.log('\n⚠️  Please run this SQL in Supabase SQL Editor:\n');
        console.log(sql);
    }
}

createSearchFunction();
