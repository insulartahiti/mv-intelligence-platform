import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: NextRequest) {
  try {
    const { artifact_id, organization_id, organization_name } = await request.json();

    if (!artifact_id) {
      return NextResponse.json({
        status: 'error',
        message: 'Artifact ID is required'
      }, { status: 400 });
    }

    if (!organization_id) {
      return NextResponse.json({
        status: 'error',
        message: 'Organization ID is required'
      }, { status: 400 });
    }

    // Update the artifact with the new organization ID
    const { data: updatedArtifact, error: artifactError } = await supabase
      .from('artifacts')
      .update({
        affinity_org_id: organization_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', artifact_id)
      .select()
      .single();

    if (artifactError) {
      console.error('Failed to update artifact:', artifactError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to update artifact'
      }, { status: 500 });
    }

    // Also update the intelligence_insights record if it exists
    // First get the current tags
    const { data: currentInsight } = await supabase
      .from('intelligence_insights')
      .select('tags')
      .eq('artifact_id', artifact_id)
      .single();

    const currentTags = currentInsight?.tags || [];
    const newTag = organization_name?.toLowerCase().replace(/\s+/g, '_') || 'linked_org';
    const updatedTags = [...currentTags, newTag];

    const { data: updatedInsight, error: insightError } = await supabase
      .from('intelligence_insights')
      .update({
        tags: updatedTags,
        updated_at: new Date().toISOString()
      })
      .eq('artifact_id', artifact_id)
      .select()
      .single();

    if (insightError) {
      console.warn('Failed to update intelligence insight tags:', insightError);
      // Don't fail the whole operation if insight update fails
    }

    return NextResponse.json({
      status: 'success',
      message: 'Organization linked successfully',
      data: {
        artifact: updatedArtifact,
        insight: updatedInsight
      }
    });

  } catch (error) {
    console.error('Failed to link organization:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
