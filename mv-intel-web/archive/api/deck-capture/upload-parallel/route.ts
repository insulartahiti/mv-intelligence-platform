import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration - Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ParallelUploadRequest {
  title: string;
  description?: string;
  source_url?: string;
  source_platform: string;
  affinity_deal_id?: number;
  affinity_org_id: number;
  slides: Array<{
    id: string;
    content: string;
    slide_number: number;
    image_url?: string;
  }>;
  analysis_notes?: string;
  upload_to_affinity?: boolean;
}

// Helper function to chunk array into batches
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Parallel slide processing function
async function processSlidesInParallel(slides: any[], artifactId: string) {
  const BATCH_SIZE = 5; // Process 5 slides at once
  const batches = chunkArray(slides, BATCH_SIZE);
  
  console.log(`🚀 Processing ${slides.length} slides in ${batches.length} parallel batches of ${BATCH_SIZE}`);
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (slide) => {
      try {
        // Process slide with OCR + Vision analysis
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
          console.log(`✅ Slide ${slide.slide_number} processed successfully`);
          return { success: true, slide: slide.slide_number };
        } else {
          console.error(`❌ Slide ${slide.slide_number} processing failed:`, response.statusText);
          return { success: false, slide: slide.slide_number, error: response.statusText };
        }
      } catch (error) {
        console.error(`❌ Slide ${slide.slide_number} processing error:`, error);
        return { success: false, slide: slide.slide_number, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
    
    // Wait for all slides in this batch to complete
    await Promise.allSettled(batchPromises);
    console.log(`✅ Batch completed: ${batch.length} slides processed`);
  }
}

// Parallel AI analysis function
async function runParallelAnalysis(artifactId: string, slides: any[]) {
  console.log(`🧠 Starting parallel AI analysis for artifact ${artifactId}`);
  
  const analysisPromises = [
    // OCR + Vision analysis
    fetch(`${SUPABASE_URL}/functions/v1/process-deck-capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ artifact_id: artifactId, slides })
    }),
    
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
  
  console.log(`✅ Parallel analysis completed: ${successful} successful, ${failed} failed`);
  
  return { successful, failed, results };
}

// Background processing function
async function processInBackground(artifactId: string, slides: any[], uploadData: ParallelUploadRequest) {
  try {
    console.log(`🚀 Starting background processing for artifact ${artifactId}`);
    
    // Step 1: Parallel slide processing
    await processSlidesInParallel(slides, artifactId);
    
    // Step 2: Parallel AI analysis
    const analysisResults = await runParallelAnalysis(artifactId, slides);
    
    // Step 3: Upload to Affinity if requested
    let affinityUploadResult = null;
    if (uploadData.upload_to_affinity && AFFINITY_API_KEY) {
      try {
        console.log(`📤 Uploading to Affinity for artifact ${artifactId}`);
        
        // Get organization details from Affinity
        const orgResponse = await fetch(`${AFFINITY_BASE_URL}/organizations/${uploadData.affinity_org_id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        let organizationName = `Organization ${uploadData.affinity_org_id}`;
        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          organizationName = orgData.name || organizationName;
        }

        // Create file note in Affinity
        const affinityNote = {
          content: `# ${uploadData.title}\n\n${uploadData.description || ''}\n\n## AI Analysis Summary\n\nAnalysis completed with ${analysisResults.successful} successful processes.\n\n${uploadData.analysis_notes ? `\n## Additional Notes\n\n${uploadData.analysis_notes}` : ''}\n\n---\n*This analysis was generated by MV Intelligence Platform*`,
          organization_ids: [uploadData.affinity_org_id],
          deal_ids: uploadData.affinity_deal_id ? [uploadData.affinity_deal_id] : undefined
        };

        const noteResponse = await fetch(`${AFFINITY_BASE_URL}/notes`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(affinityNote)
        });

        if (noteResponse.ok) {
          affinityUploadResult = await noteResponse.json();
          
          // Update artifact with Affinity note ID
          await supabase
            .from('artifacts')
            .update({ 
              affinity_note_id: affinityUploadResult.id,
              status: 'PROCESSED'
            })
            .eq('id', artifactId);
        }
      } catch (affinityError) {
        console.error('Affinity upload failed:', affinityError);
      }
    }
    
    // Step 4: Update artifact status
    await supabase
      .from('artifacts')
      .update({ 
        status: 'PROCESSED',
        metadata: {
          analysis_completed: true,
          affinity_upload_completed: !!affinityUploadResult,
          parallel_processing_completed: true,
          processing_completed_at: new Date().toISOString(),
          analysis_results: analysisResults
        }
      })
      .eq('id', artifactId);
    
    console.log(`✅ Background processing completed for artifact ${artifactId}`);
    
  } catch (error) {
    console.error(`❌ Background processing failed for artifact ${artifactId}:`, error);
    
    // Update artifact with error status
    await supabase
      .from('artifacts')
      .update({ 
        status: 'ERROR',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          processing_failed_at: new Date().toISOString()
        }
      })
      .eq('id', artifactId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ParallelUploadRequest = await request.json();
    const {
      title,
      description,
      source_url,
      source_platform,
      affinity_deal_id,
      affinity_org_id,
      slides,
      analysis_notes,
      upload_to_affinity = true
    } = body;

    if (!title || !slides || slides.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Title and slides are required'
      }, { status: 400 });
    }

    console.log(`🚀 Starting parallel upload for: ${title} (${slides.length} slides)`);

    // Step 1: Create artifact record (fast)
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .insert({
        kind: 'presentation',
        title: title,
        description: description || '',
        source_url: source_url || '',
        source_platform: source_platform,
        affinity_deal_id: affinity_deal_id,
        affinity_org_id: affinity_org_id,
        slide_count: slides.length,
        status: 'CAPTURED',
        metadata: {
          upload_method: 'parallel_upload',
          analysis_requested: true,
          affinity_upload_enabled: upload_to_affinity,
          parallel_processing: true
        }
      })
      .select()
      .single();

    if (artifactError) {
      console.error('Failed to create artifact:', artifactError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to create artifact record'
      }, { status: 500 });
    }

    // Step 2: Store slides in database (fast)
    const slidesData = slides.map(slide => ({
      artifact_id: artifact.id,
      slide_number: slide.slide_number,
      text_content: slide.content,
      image_url: slide.image_url || null,
      title: `Slide ${slide.slide_number}`,
      content_summary: slide.content ? slide.content.substring(0, 500) : null
    }));

    const { error: slidesError } = await supabase
      .from('slides')
      .insert(slidesData);

    if (slidesError) {
      console.error('Failed to store slides:', slidesError);
      // Continue - we can still process the analysis
    }

    // Step 3: Return immediately with artifact ID
    const response = NextResponse.json({
      status: 'success',
      message: 'Deck uploaded successfully, parallel processing in progress...',
      data: {
        artifact_id: artifact.id,
        processing_summary: {
          slides_stored: slides.length,
          parallel_processing: true,
          background_processing: true
        }
      }
    });

    // Step 4: Trigger parallel background processing (non-blocking)
    setImmediate(async () => {
      await processInBackground(artifact.id, slides, body);
    });

    console.log(`✅ Parallel upload initiated for artifact ${artifact.id}`);
    return response;

  } catch (error) {
    console.error('Parallel upload error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
