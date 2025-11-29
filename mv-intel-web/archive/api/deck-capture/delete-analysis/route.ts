import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development (same as recent-analysis API)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get('id');

    if (!analysisId) {
      return NextResponse.json({
        status: 'error',
        message: 'Analysis ID is required'
      }, { status: 400 });
    }

    // Delete the analysis from intelligence_insights table
    const { error: insightsError } = await supabase
      .from('intelligence_insights')
      .delete()
      .eq('id', analysisId);

    if (insightsError) {
      console.error('Failed to delete intelligence insights:', insightsError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to delete analysis',
        error: insightsError.message
      }, { status: 500 });
    }

    // Also delete associated slides if they exist
    const { error: slidesError } = await supabase
      .from('slides')
      .delete()
      .eq('artifact_id', analysisId);

    if (slidesError) {
      console.error('Failed to delete associated slides:', slidesError);
      // Don't fail the request if slides deletion fails
    }

    // Optionally delete the artifact itself
    const { error: artifactError } = await supabase
      .from('artifacts')
      .delete()
      .eq('id', analysisId);

    if (artifactError) {
      console.error('Failed to delete artifact:', artifactError);
      // Don't fail the request if artifact deletion fails
    }

    return NextResponse.json({
      status: 'success',
      message: 'Analysis deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete analysis:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to delete analysis',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
