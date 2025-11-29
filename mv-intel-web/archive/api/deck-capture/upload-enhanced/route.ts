import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration - Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface EnhancedUploadRequest {
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

export async function POST(request: NextRequest) {
  try {
    const body: EnhancedUploadRequest = await request.json();
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

    // Step 1: Create artifact record in our database
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
          upload_method: 'enhanced_upload',
          analysis_requested: true,
          affinity_upload_enabled: upload_to_affinity
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

    // Step 2: Store slides in database
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

    // Step 3: Trigger AI analysis
    let analysisResult = null;
    try {
      const analysisResponse = await fetch(`${request.nextUrl.origin}/api/deck-capture/analyze-vision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slides: slides,
          organization_id: affinity_org_id,
          organization_name: `Organization ${affinity_org_id}`, // We'll get the actual name from Affinity
          deck_title: title
        })
      });

      if (analysisResponse.ok) {
        analysisResult = await analysisResponse.json();
        
        // Update the intelligence_insights record with the artifact_id
        if (analysisResult.analysis_id) {
          await supabase
            .from('intelligence_insights')
            .update({ artifact_id: artifact.id })
            .eq('id', analysisResult.analysis_id);
        }
      }
    } catch (analysisError) {
      console.error('Analysis failed:', analysisError);
      // Continue without analysis
    }

    // Step 4: Upload to Affinity if requested
    let affinityUploadResult = null;
    if (upload_to_affinity && AFFINITY_API_KEY) {
      try {
        // Get organization details from Affinity
        const orgResponse = await fetch(`${AFFINITY_BASE_URL}/organizations/${affinity_org_id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        let organizationName = `Organization ${affinity_org_id}`;
        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          organizationName = orgData.name || organizationName;
        }

        // Create file note in Affinity
        const affinityNote = {
          content: `# ${title}\n\n${description || ''}\n\n## AI Analysis Summary\n\n${analysisResult?.analysis?.executive_summary || 'Analysis in progress...'}\n\n## Key Insights\n\n${analysisResult?.analysis?.key_insights?.map((insight: string) => `- ${insight}`).join('\n') || 'Insights being generated...'}\n\n## Recommendations\n\n${analysisResult?.analysis?.recommendations?.map((rec: string) => `- ${rec}`).join('\n') || 'Recommendations being generated...'}\n\n${analysis_notes ? `\n## Additional Notes\n\n${analysis_notes}` : ''}\n\n---\n*This analysis was generated by MV Intelligence Platform*`,
          organization_ids: [affinity_org_id],
          deal_ids: affinity_deal_id ? [affinity_deal_id] : undefined
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
            .eq('id', artifact.id);
        } else {
          console.error('Failed to create Affinity note:', await noteResponse.text());
        }
      } catch (affinityError) {
        console.error('Affinity upload failed:', affinityError);
        // Continue without Affinity upload
      }
    }

    // Step 5: Update artifact status
    await supabase
      .from('artifacts')
      .update({ 
        status: 'PROCESSED',
        metadata: {
          ...artifact.metadata,
          analysis_completed: !!analysisResult,
          affinity_upload_completed: !!affinityUploadResult,
          processing_completed_at: new Date().toISOString()
        }
      })
      .eq('id', artifact.id);

    return NextResponse.json({
      status: 'success',
      message: 'Deck uploaded and analyzed successfully',
      data: {
        artifact_id: artifact.id,
        analysis: analysisResult?.analysis || null,
        affinity_note_id: affinityUploadResult?.id || null,
        processing_summary: {
          slides_stored: slides.length,
          analysis_completed: !!analysisResult,
          affinity_upload_completed: !!affinityUploadResult
        }
      }
    });

  } catch (error) {
    console.error('Enhanced upload error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
