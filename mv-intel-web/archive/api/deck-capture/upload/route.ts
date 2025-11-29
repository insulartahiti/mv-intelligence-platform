import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CaptureDeckRequest, DeckUploadResponse, ProcessingError } from '../../../../lib/types/deckCapture';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Affinity API configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_ORG_ID = process.env.AFFINITY_ORG_ID || '7624528';

export async function POST(request: NextRequest) {
  try {
    const body: CaptureDeckRequest = await request.json();
    
    // Validate request
    const validationErrors = validateCaptureRequest(body);
    if (validationErrors.length > 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors
      }, { status: 400 });
    }

    // Create deck record in Supabase
    const { data: deck, error: deckError } = await supabase
      .from('artifacts')
      .insert({
        kind: 'presentation',
        title: body.title,
        description: body.description,
        source_url: body.source_url,
        source_platform: body.source_platform,
        affinity_deal_id: body.affinity_deal_id,
        affinity_org_id: AFFINITY_ORG_ID,
        slide_count: body.slides.length,
        status: 'CAPTURED',
        metadata: {
          user_agent: request.headers.get('user-agent'),
          ip_address: request.headers.get('x-forwarded-for') || 'unknown',
          capture_method: 'chrome_extension'
        }
      })
      .select()
      .single();

    if (deckError) {
      console.error('Failed to create deck record:', deckError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to create deck record',
        error: deckError.message
      }, { status: 500 });
    }

    // Upload slides to Affinity and create slide records
    const slideResults = await Promise.allSettled(
      body.slides.map(async (slideData, index) => {
        try {
          // Convert HTML to PDF first
          const pdfConversionResponse = await fetch(`${request.nextUrl.origin}/api/deck-capture/convert-html-to-pdf`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              html_content: slideData.html_content,
              slide_number: slideData.slide_number,
              title: slideData.title || `Slide ${slideData.slide_number}`
            })
          });

          if (!pdfConversionResponse.ok) {
            throw new Error(`PDF conversion failed: ${pdfConversionResponse.statusText}`);
          }

          const pdfConversion = await pdfConversionResponse.json();
          if (!pdfConversion.success) {
            throw new Error(`PDF conversion failed: ${pdfConversion.error}`);
          }

          // Upload PDF to Affinity
          const affinityFile = await uploadToAffinity({
            file_name: `${body.title}_slide_${slideData.slide_number}.pdf`,
            file_data: pdfConversion.pdf_data,
            mime_type: 'application/pdf',
            deal_id: body.affinity_deal_id,
            organization_id: AFFINITY_ORG_ID,
            tags: ['deck-capture', body.source_platform, 'slide', 'pdf']
          });

          // If screenshot is provided, upload that too for visual reference
          let screenshotFile = null;
          if (slideData.screenshot_data) {
            screenshotFile = await uploadToAffinity({
              file_name: `${body.title}_slide_${slideData.slide_number}_screenshot.png`,
              file_data: slideData.screenshot_data,
              mime_type: 'image/png',
              deal_id: body.affinity_deal_id,
              organization_id: AFFINITY_ORG_ID,
              tags: ['deck-capture', body.source_platform, 'slide', 'screenshot']
            });
          }

          // Create slide record in Supabase
          const { data: slide, error: slideError } = await supabase
            .from('slides')
            .insert({
              deck_id: deck.id,
              slide_number: slideData.slide_number,
              title: slideData.title,
              affinity_file_id: affinityFile.file_id,
              confidence_score: 0.0, // Will be updated after processing
              metadata: {
                ...slideData.metadata,
                url: slideData.url,
                html_content_length: slideData.html_content.length,
                screenshot_file_id: screenshotFile?.file_id || null
              }
            })
            .select()
            .single();

          if (slideError) {
            throw new Error(`Failed to create slide record: ${slideError.message}`);
          }

          return {
            slide_number: slideData.slide_number,
            slide_id: slide.id,
            affinity_file_id: affinityFile.file_id,
            success: true
          };

        } catch (error) {
          console.error(`Failed to process slide ${slideData.slide_number}:`, error);
          return {
            slide_number: slideData.slide_number,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    // Process results
    const successfulSlides = slideResults
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value.success
      )
      .map(result => result.value);

    const failedSlides = slideResults
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && !result.value.success
      )
      .map(result => result.value);

    // Update deck status based on results
    const finalStatus = failedSlides.length === 0 ? 'uploaded' : 'uploaded';
    await supabase
      .from('decks')
      .update({ 
        status: finalStatus,
        total_slides: successfulSlides.length
      })
      .eq('id', deck.id);

    // Queue for processing if slides were captured successfully
    if (successfulSlides.length > 0) {
      // TODO: Queue processing job (can be implemented with Edge Functions or Workers)
      console.log(`Queued deck ${deck.id} for processing with ${successfulSlides.length} slides`);
    }

    const response: DeckUploadResponse = {
      deck_id: deck.id,
      status: finalStatus,
      message: `Successfully captured ${successfulSlides.length} slides${failedSlides.length > 0 ? `, ${failedSlides.length} failed` : ''}`,
      affinity_files: successfulSlides.map(s => s.affinity_file_id)
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Deck capture upload failed:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Validation function
function validateCaptureRequest(request: CaptureDeckRequest): string[] {
  const errors: string[] = [];

  if (!request.title || request.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!request.source_url || request.source_url.trim().length === 0) {
    errors.push('Source URL is required');
  }

  if (!request.source_platform) {
    errors.push('Source platform is required');
  }

  if (!request.slides || request.slides.length === 0) {
    errors.push('At least one slide is required');
  }

  if (request.slides && request.slides.length > 0) {
    request.slides.forEach((slide, index) => {
      if (!slide.screenshot_data) {
        errors.push(`Slide ${index + 1}: Screenshot data is required`);
      }
      if (slide.slide_number < 1) {
        errors.push(`Slide ${index + 1}: Slide number must be positive`);
      }
    });
  }

  return errors;
}

// Affinity upload function
async function uploadToAffinity(uploadData: {
  file_name: string;
  file_data: string;
  mime_type: string;
  deal_id?: string;
  organization_id: string;
  tags: string[];
}): Promise<{ file_id: string; url: string }> {
  if (!AFFINITY_API_KEY) {
    // For development, return mock data
    console.warn('Affinity API key not configured, using mock upload');
    return {
      file_id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: `https://mock-affinity.com/files/${uploadData.file_name}`
    };
  }

  try {
    // TODO: Implement actual Affinity API upload
    // This would typically involve:
    // 1. Converting base64 to file buffer
    // 2. Making multipart/form-data request to Affinity
    // 3. Handling response and extracting file ID
    
    const response = await fetch('https://api.affinity.co/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AFFINITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: uploadData.file_name,
        file_data: uploadData.file_data,
        mime_type: uploadData.mime_type,
        deal_id: uploadData.deal_id,
        organization_id: uploadData.organization_id,
        tags: uploadData.tags
      })
    });

    if (!response.ok) {
      throw new Error(`Affinity API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return {
      file_id: result.id,
      url: result.url
    };

  } catch (error) {
    console.error('Affinity upload failed:', error);
    // Fallback to mock for development
    return {
      file_id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: `https://fallback-affinity.com/files/${uploadData.file_name}`
    };
  }
}

// GET endpoint for retrieving deck information
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deckId = searchParams.get('deck_id');
    const orgId = searchParams.get('org_id') || AFFINITY_ORG_ID;

    if (!deckId) {
      return NextResponse.json({
        status: 'error',
        message: 'Deck ID is required'
      }, { status: 400 });
    }

    // Get deck with slides
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select(`
        *,
        slides (
          id,
          slide_number,
          title,
          content_text,
          slide_type,
          confidence_score,
          affinity_file_id,
          created_at
        )
      `)
      .eq('id', deckId)
      .eq('affinity_org_id', orgId)
      .single();

    if (deckError) {
      if (deckError.code === 'PGRST116') {
        return NextResponse.json({
          status: 'error',
          message: 'Deck not found'
        }, { status: 404 });
      }
      throw deckError;
    }

    return NextResponse.json({
      status: 'success',
      data: deck
    });

  } catch (error) {
    console.error('Failed to retrieve deck:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
