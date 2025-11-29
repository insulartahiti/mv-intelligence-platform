import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
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

    // Get LinkedIn connections (stored in enrichment_data)
    const { count: linkedinConnections } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('enrichment_data->linkedin_first_degree', 'is', null);

    // Get entities with AI enhancement (ai_summary and taxonomy)
    const { count: entitiesWithEnhancement } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('ai_summary', 'is', null)
      .not('taxonomy', 'is', null);

    // Get entities with hybrid enhancement method (GPT-4o + Perplexity)
    const { count: entitiesWithHybridEnhancement } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('enrichment_data->>enhancement_method', 'gpt4o_perplexity_search_hybrid');

    // Get entities with AI summary only (partial enhancement)
    const { count: entitiesWithAISummary } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('ai_summary', 'is', null);

    // Get entities with taxonomy only (partial enhancement)
    const { count: entitiesWithTaxonomy } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
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

    // Get interaction count from edges (interaction_count field)
    const { data: interactionStats } = await supabase
      .schema('graph')
      .from('edges')
      .select('interaction_count')
      .not('interaction_count', 'is', null);

    const totalInteractions = interactionStats?.reduce((sum, edge) => sum + (edge.interaction_count || 0), 0) || 0;

    // Get last sync timestamp
    const { data: syncState } = await supabase
      .schema('graph')
      .from('sync_state')
      .select('last_sync_timestamp, entities_synced, rate_limit_remaining, status')
      .order('last_sync_timestamp', { ascending: false })
      .limit(1)
      .single();

    // Calculate coverage percentages
    const embeddingCoverage = totalEntities ? ((entitiesWithEmbeddings || 0) / totalEntities) * 100 : 0;
    const enhancementCoverage = totalEntities ? ((entitiesWithEnhancement || 0) / totalEntities) * 100 : 0;
    const hybridEnhancementCoverage = totalEntities ? ((entitiesWithHybridEnhancement || 0) / totalEntities) * 100 : 0;
    const aiSummaryCoverage = totalEntities ? ((entitiesWithAISummary || 0) / totalEntities) * 100 : 0;
    const taxonomyCoverage = totalEntities ? ((entitiesWithTaxonomy || 0) / totalEntities) * 100 : 0;
    const affinityCoverage = totalEntities ? ((affinityEntities || 0) / totalEntities) * 100 : 0;

    const status = {
      totalEntities: totalEntities || 0,
      entitiesWithEmbeddings: entitiesWithEmbeddings || 0,
      embeddingCoverage: Math.round(embeddingCoverage * 10) / 10,
      entitiesWithEnhancement: entitiesWithEnhancement || 0,
      enhancementCoverage: Math.round(enhancementCoverage * 10) / 10,
      // New hybrid enhancement metrics
      entitiesWithHybridEnhancement: entitiesWithHybridEnhancement || 0,
      hybridEnhancementCoverage: Math.round(hybridEnhancementCoverage * 10) / 10,
      entitiesWithAISummary: entitiesWithAISummary || 0,
      aiSummaryCoverage: Math.round(aiSummaryCoverage * 10) / 10,
      entitiesWithTaxonomy: entitiesWithTaxonomy || 0,
      taxonomyCoverage: Math.round(taxonomyCoverage * 10) / 10,
      totalEdges: totalEdges || 0,
      linkedinConnections: linkedinConnections || 0,
      // Affinity-specific metrics
      affinityEntities: affinityEntities || 0,
      affinityPersons: affinityPersons || 0,
      affinityCoverage: Math.round(affinityCoverage * 10) / 10,
      totalInteractions: totalInteractions || 0,
      lastSyncTimestamp: syncState?.last_sync_timestamp || null,
      lastSyncEntitiesSynced: syncState?.entities_synced || 0,
      rateLimitRemaining: syncState?.rate_limit_remaining || 300,
      syncStatus: syncState?.status || 'unknown',
      lastUpdated: new Date().toISOString()
    };

    console.log('✅ System status fetched:', status);

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