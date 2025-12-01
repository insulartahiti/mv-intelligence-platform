import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { emailId, analysisData, companyLinks, extractedKPIs, insights } = await req.json();

    if (!emailId || !analysisData) {
      return NextResponse.json({ 
        error: 'emailId and analysisData are required' 
      }, { status: 400 });
    }

    console.log(`🔗 Integrating email ${emailId} with knowledge graph...`);

    // 1. Store email analysis in knowledge graph
    const { error: emailError } = await supabase
      .from('email_analysis')
      .upsert({
        email_id: emailId,
        analysis_data: analysisData,
        company_links: companyLinks || [],
        extracted_kpis: extractedKPIs || [],
        insights: insights || [],
        processed_at: new Date().toISOString()
      });

    if (emailError) {
      console.warn('Error storing email analysis:', emailError);
    }

    // 2. Process entities and store in knowledge graph
    const entities = analysisData.entities || [];
    for (const entity of entities) {
      if (entity.confidence > 0.7) { // Only high-confidence entities
        const { error: entityError } = await supabase
          .from('entities')
          .upsert({
            kind: entity.type,
            name: entity.name,
            aliases: [entity.name, ...(entity.aliases || [])],
            importance: entity.importance,
            last_seen_at: new Date().toISOString(),
            source: 'email_analysis'
          });

        if (entityError) {
          console.warn(`Error storing entity ${entity.name}:`, entityError);
        }
      }
    }

    // 3. Generate embeddings for search
    await generateEmailEmbeddings(emailId, analysisData, SUPABASE_URL, SERVICE_ROLE);

    // 4. Update company relationships
    if (companyLinks && companyLinks.length > 0) {
      await updateCompanyRelationships(companyLinks, analysisData, supabase);
    }

    // 5. Store insights in knowledge graph
    if (insights && insights.length > 0) {
      await storeEmailInsights(emailId, insights, supabase);
    }

    console.log(`✅ Email ${emailId} integrated with knowledge graph`);

    return NextResponse.json({
      success: true,
      emailId,
      entitiesProcessed: entities.length,
      companyLinks: companyLinks?.length || 0,
      insightsStored: insights?.length || 0,
      message: 'Email integrated with knowledge graph successfully'
    });

  } catch (error: any) {
    console.error('Error integrating email with knowledge graph:', error);
    return NextResponse.json({ 
      error: 'Failed to integrate email with knowledge graph: ' + error.message 
    }, { status: 500 });
  }
}

async function generateEmailEmbeddings(emailId: string, analysisData: any, supabaseUrl: string, serviceRole: string) {
  try {
    console.log(`🧠 Generating embeddings for email ${emailId}...`);

    // Extract text content for embedding
    const textContent = [
      analysisData.summary || '',
      analysisData.entities?.map((e: any) => e.name).join(' ') || '',
      analysisData.topics?.map((t: any) => t.name).join(' ') || '',
      analysisData.insights?.map((i: any) => i.content).join(' ') || ''
    ].filter(Boolean).join(' ');

    if (!textContent.trim()) {
      console.warn('No text content to embed for email', emailId);
      return;
    }

    // Call the embedding generation function
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRole}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: textContent,
        source: 'email_analysis',
        metadata: {
          email_id: emailId,
          analysis_type: 'email_processing'
        }
      })
    });

    if (!response.ok) {
      console.warn('Failed to generate embeddings for email:', emailId);
    }

  } catch (error) {
    console.warn('Error generating email embeddings:', error);
  }
}

async function updateCompanyRelationships(companyLinks: any[], analysisData: any, supabase: any) {
  try {
    console.log('🔗 Updating company relationships...');

    for (const link of companyLinks) {
      const companyId = link.company.id;
      const entity = link.entity;

      // Store relationship in knowledge graph
      const { error: relationshipError } = await supabase
        .from('relationships')
        .upsert({
          from_contact: null, // Email entity
          to_contact: null,   // Company contact
          company_id: companyId,
          relationship_type: 'email_mention',
          strength: entity.confidence,
          last_interaction: new Date().toISOString(),
          source: 'email_analysis',
          interaction_count: 1,
          metadata: {
            entity_name: entity.name,
            entity_type: entity.type,
            email_id: analysisData.email_id
          }
        });

      if (relationshipError) {
        console.warn(`Error storing relationship for company ${companyId}:`, relationshipError);
      }

      // Update company intelligence
      const { error: intelligenceError } = await supabase
        .from('intelligence_overlays')
        .upsert({
          company_id: companyId,
          overlay_type: 'email_analysis',
          content: analysisData.summary || '',
          confidence: entity.confidence,
          metadata: {
            email_id: analysisData.email_id,
            entity_name: entity.name,
            analysis_data: analysisData
          },
          created_at: new Date().toISOString()
        });

      if (intelligenceError) {
        console.warn(`Error updating intelligence for company ${companyId}:`, intelligenceError);
      }
    }

  } catch (error) {
    console.warn('Error updating company relationships:', error);
  }
}

async function storeEmailInsights(emailId: string, insights: any[], supabase: any) {
  try {
    console.log(`💡 Storing email insights for ${emailId}...`);

    for (const insight of insights) {
      const { error: insightError } = await supabase
        .from('email_insights')
        .insert({
          email_id: emailId,
          insight_type: insight.type,
          title: insight.title,
          content: insight.content,
          confidence: insight.confidence,
          priority: insight.priority,
          actionable: insight.actionable,
          source: 'email_analysis'
        });

      if (insightError) {
        console.warn(`Error storing insight:`, insightError);
      }
    }

  } catch (error) {
    console.warn('Error storing email insights:', error);
  }
}


export async function GET(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { searchParams } = new URL(req.url);
    const emailId = searchParams.get('emailId');

    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    // Get email analysis from knowledge graph
    const { data: analysis, error: analysisError } = await supabase
      .from('email_analysis')
      .select('*')
      .eq('email_id', emailId)
      .single();

    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 404 });
    }

    // Get related entities
    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('*')
      .eq('source', 'email_analysis')
      .order('importance', { ascending: false })
      .limit(20);

    // Get related insights
    const { data: insights, error: insightsError } = await supabase
      .from('email_insights')
      .select('*')
      .eq('email_id', emailId)
      .order('priority', { ascending: false });

    return NextResponse.json({
      success: true,
      analysis,
      entities: entities || [],
      insights: insights || [],
      message: 'Email knowledge graph data retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error retrieving email knowledge graph data:', error);
    return NextResponse.json({ 
      error: 'Failed to retrieve email knowledge graph data: ' + error.message 
    }, { status: 500 });
  }
}
