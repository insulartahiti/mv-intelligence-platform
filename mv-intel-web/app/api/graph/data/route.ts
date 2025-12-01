import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function GET(request: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // Get entities with embeddings (limit to 100 for testing)
    const { data: entities, error: entitiesError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, domain, industry, pipeline_stage, fund, taxonomy, is_internal, is_portfolio, is_pipeline, importance, linkedin_url, enrichment_data')
      .not('embedding', 'is', null)
      .limit(100);

    if (entitiesError) {
      throw new Error(`Failed to fetch entities: ${entitiesError.message}`);
    }

    // Get edges for the entities
    const entityIds = entities.map(e => e.id);
    const { data: edges, error: edgesError } = await supabase
      .schema('graph')
      .from('edges')
      .select('id, source, target, kind, strength_score')
      .in('source', entityIds)
      .in('target', entityIds);

    if (edgesError) {
      throw new Error(`Failed to fetch edges: ${edgesError.message}`);
    }

    // Filter entities to only include those with edges
    const connectedEntityIds = new Set([
      ...edges.map(e => e.source),
      ...edges.map(e => e.target)
    ]);
    const connectedEntities = entities.filter(e => connectedEntityIds.has(e.id));

    const graphData = {
      entities: connectedEntities,
      edges: edges
    };

    return NextResponse.json(graphData);

  } catch (error) {
    console.error('Error fetching graph data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch graph data' },
      { status: 500 }
    );
  }
}
