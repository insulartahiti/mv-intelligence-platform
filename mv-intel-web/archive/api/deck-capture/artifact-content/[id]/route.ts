import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artifactId = params.id;

    if (!artifactId) {
      return NextResponse.json({
        status: 'error',
        message: 'Artifact ID is required'
      }, { status: 400 });
    }

    // Get the artifact
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', artifactId)
      .single();

    if (artifactError) {
      console.error('Failed to fetch artifact:', artifactError);
      return NextResponse.json({
        status: 'error',
        message: 'Artifact not found'
      }, { status: 404 });
    }

    // Get all slides for this artifact
    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('id, slide_number, text_content, content_summary, title, slide_type')
      .eq('artifact_id', artifactId)
      .order('slide_number', { ascending: true });

    if (slidesError) {
      console.error('Failed to fetch slides:', slidesError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch slides'
      }, { status: 500 });
    }

    // Combine all slide content
    const content = slides?.map(slide => 
      `Slide ${slide.slide_number}: ${slide.text_content || slide.content_summary || ''}`
    ).join('\n\n') || '';

    return NextResponse.json({
      status: 'success',
      data: {
        artifact,
        slides,
        content,
        slide_count: slides?.length || 0
      }
    });

  } catch (error) {
    console.error('Failed to fetch artifact content:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
