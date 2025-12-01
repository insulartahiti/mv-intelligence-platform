import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    console.log('📊 Fetching system status...');

    // Get total entities
    const { count: totalEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true });

    // Get entities with embeddings
    const { count: entitiesWithEmbeddings } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    // Get total edges
    const { count: totalEdges } = await supabase
      .schema('graph')
      .from('edges')
      .select('*', { count: 'exact', head: true });

    // Get LinkedIn connections
    const { count: linkedinConnections } = await supabase
      .schema('graph')
      .from('linkedin_connections')
      .select('*', { count: 'exact', head: true });

    // Get entities with AI enhancement (ai_summary and taxonomy)
    const { count: entitiesWithEnhancement } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('brief_description', 'is', null) // Proxy for AI summary
      .not('taxonomy', 'is', null);

    // Get Affinity-specific metrics
    const { count: affinityEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('affinity_org_id', 'is', null);

    const { count: affinityPersons } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('affinity_person_id', 'is', null);

    // Get Interaction metrics
    const { count: totalInteractions } = await supabase
      .schema('graph')
      .from('interactions')
      .select('*', { count: 'exact', head: true });
      
    // Count interactions with embeddings (from embed_interactions.ts)
    const { count: interactionsWithEmbedding } = await supabase
      .schema('graph')
      .from('interactions')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    // Count entity summaries (from summarize_interactions.ts -> entity_notes_rollup)
    const { count: entitiesWithSummary } = await supabase
      .schema('graph')
      .from('entity_notes_rollup')
      .select('*', { count: 'exact', head: true })
      .not('latest_summary', 'is', null);
    
    // Count entities that have interactions (for coverage calculation)
    const { count: entitiesWithInteractions } = await supabase
      .schema('graph')
      .from('interactions')
      .select('entity_id', { count: 'exact', head: true });

    // Get Affinity Files
    const { count: totalFiles } = await supabase
        .schema('graph')
        .from('affinity_files')
        .select('*', { count: 'exact', head: true });

    // Get last sync timestamp
    const { data: syncState } = await supabase
      .schema('graph')
      .from('sync_state')
      .select('last_sync_timestamp, entities_synced, rate_limit_remaining, status')
      .order('last_sync_timestamp', { ascending: false })
      .limit(1)
      .single();

    // Get recent history logs (for activity feed)
    const { data: recentHistory } = await supabase
      .schema('graph')
      .from('history_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(5);

    const status = {
      totalEntities: totalEntities || 0,
      entitiesWithEmbeddings: entitiesWithEmbeddings || 0,
      embeddingCoverage: totalEntities ? Math.round(((entitiesWithEmbeddings || 0) / totalEntities) * 100) : 0,
      entitiesWithEnhancement: entitiesWithEnhancement || 0,
      enhancementCoverage: totalEntities ? Math.round(((entitiesWithEnhancement || 0) / totalEntities) * 100) : 0,
      totalEdges: totalEdges || 0,
      linkedinConnections: linkedinConnections || 0,
      
      // Affinity
      affinityEntities: (affinityEntities || 0) + (affinityPersons || 0),
      totalInteractions: totalInteractions || 0,
      // Interaction Embedding Coverage (embed_interactions.ts)
      interactionEmbeddingCoverage: totalInteractions ? Math.round(((interactionsWithEmbedding || 0) / totalInteractions) * 100) : 0,
      // Entity Summary Coverage (summarize_interactions.ts -> entity_notes_rollup)
      interactionCoverage: entitiesWithInteractions ? Math.round(((entitiesWithSummary || 0) / (entitiesWithInteractions || 1)) * 100) : 0,
      entitiesWithSummary: entitiesWithSummary || 0,
      totalFiles: totalFiles || 0,

      // Sync State
      lastSyncTimestamp: syncState?.last_sync_timestamp || null,
      lastSyncEntitiesSynced: syncState?.entities_synced || 0,
      syncStatus: syncState?.status || 'idle',
      
      recentHistory: recentHistory || [],
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      status
    });

  } catch (error) {
    console.error('❌ Error fetching system status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch system status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
