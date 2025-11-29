import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration - Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface StreamingUploadRequest {
  action: 'start' | 'slide' | 'complete';
  artifact_id?: string;
  title?: string;
  description?: string;
  source_url?: string;
  source_platform: string;
  affinity_deal_id?: number;
  affinity_org_id: number;
  slide?: {
    id: string;
    content: string;
    slide_number: number;
    image_url?: string;
  };
  total_slides?: number;
  analysis_notes?: string;
  upload_to_affinity?: boolean;
}

// Note: Image compression removed - using lower quality capture instead

// Process individual slide with AI analysis
async function processSlideWithAI(slide: any, artifactId: string) {
  try {
    console.log(`🧠 Processing slide ${slide.slide_number} with AI...`);
    
    // Call the Edge Function for individual slide processing
    const response = await fetch(`${SUPABASE_URL}/functions/v1/process-deck-capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        artifact_id: artifactId, 
        slides: [slide] // Process one slide at a time
      })
    });
    
    if (response.ok) {
      console.log(`✅ Slide ${slide.slide_number} AI processing completed`);
      return { success: true, slide: slide.slide_number };
    } else {
      console.error(`❌ Slide ${slide.slide_number} AI processing failed:`, response.statusText);
      return { success: false, slide: slide.slide_number, error: response.statusText };
    }
  } catch (error) {
    console.error(`❌ Slide ${slide.slide_number} AI processing error:`, error);
    return { success: false, slide: slide.slide_number, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Final comprehensive analysis when all slides are captured
async function runFinalAnalysis(artifactId: string, totalSlides: number) {
  try {
    console.log(`🎯 Running final comprehensive analysis for artifact ${artifactId} (${totalSlides} slides)`);
    
    // Get all slides for the artifact
    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('*')
      .eq('artifact_id', artifactId)
      .order('slide_number');
    
    if (slidesError) {
      console.error('Failed to fetch slides for final analysis:', slidesError);
      return { success: false, error: slidesError.message };
    }
    
    // Run comprehensive analysis in parallel
    const analysisPromises = [
      // Generate embeddings for search
      fetch(`${SUPABASE_URL}/functions/v1/synth-ocr-embed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ artifactId })
      }),
      
      // Business intelligence analysis
      fetch(`${SUPABASE_URL}/functions/v1/synth-summarize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ artifactId })
      }),
      
      // Extract KPIs and metrics
      fetch(`${SUPABASE_URL}/functions/v1/synth-extract-kpis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ artifactId })
      })
    ];
    
    const results = await Promise.allSettled(analysisPromises);
    
    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.filter(result => result.status === 'rejected').length;
    
    console.log(`✅ Final analysis completed: ${successful} successful, ${failed} failed`);
    
    return { success: true, successful, failed, results };
    
  } catch (error) {
    console.error(`❌ Final analysis failed for artifact ${artifactId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: StreamingUploadRequest = await request.json();
    console.log('📥 Request body received:', body);
    
    const { action, artifact_id, title, description, source_url, source_platform, affinity_deal_id, affinity_org_id, slide, total_slides, analysis_notes, upload_to_affinity = true } = body;

    console.log(`🔄 Streaming upload action: ${action}`);
    console.log('📋 Parsed parameters:', { action, artifact_id, title, source_platform, affinity_org_id });

    if (action === 'start') {
      // Initialize new artifact
      if (!title || !source_platform) {
        return NextResponse.json({
          status: 'error',
          message: 'Title and source_platform are required for start action'
        }, { status: 400 });
      }

      console.log(`🚀 Starting streaming capture for: ${title}`);

      console.log('📝 Inserting artifact with data:', {
        kind: 'presentation',
        title: title,
        description: description || '',
        source_url: source_url || '',
        source_platform: source_platform,
        affinity_org_id: affinity_org_id.toString(),
        slide_count: 0,
        status: 'CAPTURING',
        metadata: {
          upload_method: 'streaming_upload',
          analysis_requested: true,
          affinity_upload_enabled: upload_to_affinity,
          streaming_processing: true,
          started_at: new Date().toISOString()
        }
      });

      const { data: artifact, error: artifactError } = await supabase
        .from('artifacts')
        .insert({
          kind: 'presentation',
          title: title,
          source_url: source_url || '',
          slide_count: 0, // Will be updated as slides are added
          status: 'CAPTURING'
        })
        .select()
        .single();

      console.log('📝 Artifact insert result:', { artifact, artifactError });

      if (artifactError) {
        console.error('❌ Failed to create artifact:', artifactError);
        return NextResponse.json({
          status: 'error',
          message: 'Failed to create artifact record',
          details: artifactError.message
        }, { status: 500 });
      }

      if (!artifact) {
        console.error('❌ No artifact returned from insert');
        return NextResponse.json({
          status: 'error',
          message: 'No artifact returned from insert'
        }, { status: 500 });
      }

      console.log('✅ Artifact created successfully:', artifact.id);

      return NextResponse.json({
        status: 'success',
        message: 'Streaming capture started',
        data: {
          artifact_id: artifact.id,
          status: 'CAPTURING'
        }
      });

    } else if (action === 'slide') {
      // Process individual slide
      if (!artifact_id || !slide) {
        return NextResponse.json({
          status: 'error',
          message: 'artifact_id and slide are required for slide action'
        }, { status: 400 });
      }

      console.log(`📸 Processing slide ${slide.slide_number} for artifact ${artifact_id}`);

      // Store slide in database (no compression - using lower quality capture)
      const { error: slideError } = await supabase
        .from('slides')
        .insert({
          artifact_id: artifact_id,
          slide_number: slide.slide_number,
          text_content: slide.content,
          image_url: slide.image_url || null,
          title: `Slide ${slide.slide_number}`,
          content_summary: slide.content ? slide.content.substring(0, 500) : null
        });

      if (slideError) {
        console.error('Failed to store slide:', slideError);
        return NextResponse.json({
          status: 'error',
          message: 'Failed to store slide'
        }, { status: 500 });
      }

      // Update metadata only (don't update slide_count until complete)
      await supabase
        .from('artifacts')
        .update({ 
          metadata: {
            last_slide_processed: slide.slide_number,
            last_processed_at: new Date().toISOString()
          }
        })
        .eq('id', artifact_id);

      // Process slide with AI in background (non-blocking)
      setImmediate(async () => {
        await processSlideWithAI(slide, artifact_id);
      });

      return NextResponse.json({
        status: 'success',
        message: `Slide ${slide.slide_number} processed`,
        data: {
          artifact_id: artifact_id,
          slide_number: slide.slide_number,
          ai_processing: 'started'
        }
      });

    } else if (action === 'complete') {
      // Complete the capture and run final analysis
      if (!artifact_id || !total_slides) {
        return NextResponse.json({
          status: 'error',
          message: 'artifact_id and total_slides are required for complete action'
        }, { status: 400 });
      }

      console.log(`🏁 Completing streaming capture for artifact ${artifact_id} (${total_slides} slides)`);

      // Update artifact status
      await supabase
        .from('artifacts')
        .update({ 
          status: 'PROCESSING',
          slide_count: total_slides,
          metadata: {
            capture_completed: true,
            total_slides: total_slides,
            completed_at: new Date().toISOString()
          }
        })
        .eq('id', artifact_id);

      // Run final comprehensive analysis in background
      setImmediate(async () => {
        try {
          const analysisResult = await runFinalAnalysis(artifact_id, total_slides);
          
          // Update artifact with final status
          await supabase
            .from('artifacts')
            .update({ 
              status: 'PROCESSED',
              metadata: {
                analysis_completed: true,
                final_analysis_completed_at: new Date().toISOString(),
                analysis_results: analysisResult
              }
            })
            .eq('id', artifact_id);
          
          console.log(`✅ Streaming capture and analysis completed for artifact ${artifact_id}`);
        } catch (error) {
          console.error(`❌ Final analysis failed for artifact ${artifact_id}:`, error);
          
          await supabase
            .from('artifacts')
            .update({ 
              status: 'ERROR',
              metadata: {
                error: error instanceof Error ? error.message : 'Unknown error',
                processing_failed_at: new Date().toISOString()
              }
            })
            .eq('id', artifact_id);
        }
      });

      return NextResponse.json({
        status: 'success',
        message: 'Streaming capture completed, final analysis in progress',
        data: {
          artifact_id: artifact_id,
          total_slides: total_slides,
          status: 'PROCESSING',
          final_analysis: 'started'
        }
      });

    } else {
      return NextResponse.json({
        status: 'error',
        message: 'Invalid action. Must be start, slide, or complete'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Streaming upload error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
