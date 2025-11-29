import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request: NextRequest) {
  try {
    // Get recent intelligence insights (deck analyses)
    const { data: insights, error } = await supabase
      .from('intelligence_insights')
      .select(`
        id,
        insight_type,
        insight_data,
        relevance_score,
        created_at,
        tags,
        artifact_id
      `)
      .eq('insight_type', 'deck_analysis')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Failed to fetch recent analysis:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch recent analysis'
      }, { status: 500 });
    }

    // Get artifact details for insights that have artifact_id
    const artifactIds = insights?.filter(insight => insight.artifact_id).map(insight => insight.artifact_id) || [];
    let artifacts = {};
    
    if (artifactIds.length > 0) {
      const { data: artifactData } = await supabase
        .from('artifacts')
        .select('id, title, source_url, affinity_org_id')
        .in('id', artifactIds);
      
      artifacts = artifactData?.reduce((acc: any, artifact) => {
        acc[artifact.id] = artifact;
        return acc;
      }, {}) || {};
    }

    // Parse and format the analysis data
    const formattedInsights = insights?.map(insight => {
      const analysis = insight.insight_data || {};
      const artifact = (artifacts as any)[insight.artifact_id] || {};
      const entities = analysis.extracted_entities || {};

      return {
        id: insight.id,
        title: `Deck Analysis - ${artifact.title || 'Unknown'}`,
        artifact_id: insight.artifact_id,
        artifact_title: artifact.title,
        source_url: artifact.source_url,
        organization_id: artifact.affinity_org_id,
        executive_summary: analysis.executive_summary || 'Analysis summary not available',
        key_insights: analysis.key_insights || [],
        recommendations: analysis.recommendations || [],
        confidence_score: insight.relevance_score,
        created_at: insight.created_at,
        tags: insight.tags || [],
        // Company information from extracted entities
        company_info: {
          companies: entities.companies || [],
          technologies: entities.technologies || [],
          markets: entities.markets || [],
          people: entities.people || []
        },
        // Additional metadata
        business_model: analysis.business_model,
        market_analysis: analysis.market_analysis,
        competitive_landscape: analysis.competitive_landscape,
        financial_highlights: analysis.financial_highlights
      };
    }) || [];

    return NextResponse.json({
      status: 'success',
      data: formattedInsights
    });

  } catch (error) {
    console.error('Recent analysis error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
