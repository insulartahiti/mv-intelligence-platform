import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  try {
    console.log('[Portfolio API] Fetching companies with is_portfolio=true filter');
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const fund = searchParams.get('fund');
    const companyId = searchParams.get('companyId');
    
    const supabase = getSupabaseClient();
    
    // Build query using Supabase (Knowledge Graph Source of Truth)
    let dbQuery = supabase
        .schema('graph')
        .from('entities')
        .select(`
          id, 
          name, 
          domain, 
          industry, 
          fund, 
          location_city, 
          location_country, 
          investment_amount, 
          brief_description,
          linkedin_url,
          pipeline_stage,
          type,
          is_portfolio,
          taxonomy,
          enrichment_data,
          business_analysis,
          ai_summary
        `)
        .eq('type', 'organization')
        .eq('is_portfolio', true); // Ensure strictly portfolio companies
        
    // Search logic (Agent-style hybrid matching would be better, but ILIKE is consistent with simple filtering)
    if (query.length > 0) {
        dbQuery = dbQuery.ilike('name', `%${query}%`);
    }
    
    if (fund) {
      dbQuery = dbQuery.eq('fund', fund);
    }

    if (companyId) {
      dbQuery = dbQuery.eq('id', companyId);
    }
    
    // Order by name
    dbQuery = dbQuery.order('name', { ascending: true });
    dbQuery = dbQuery.limit(100);
    
    const { data, error } = await dbQuery;
    
    if (error) {
        console.error('Database error:', error);
        throw error;
    }
    
    console.log(`[Portfolio API] Found ${data?.length || 0} companies`);

    // Agent-style Enrichment / Mapping Logic
    // Maps properties robustly using enrichment data if primary fields are missing
    const companies = await Promise.all((data || []).map(async (entity: any) => {
        // Parse JSONB fields safely
        let enrichment = entity.enrichment_data || {};
        if (typeof enrichment === 'string') {
            try {
                enrichment = JSON.parse(enrichment);
            } catch (e) {
                console.warn(`Failed to parse enrichment_data for ${entity.id}`, e);
                enrichment = {};
            }
        }
            
        let analysis = entity.business_analysis || {};
        if (typeof analysis === 'string') {
            try {
                analysis = JSON.parse(analysis);
            } catch (e) {
                console.warn(`Failed to parse business_analysis for ${entity.id}`, e);
                analysis = {};
            }
        }

        let latestSummary = null;
        let summaryDate = null;

        // If fetching a specific company, include the latest AI summary from interaction rollup
        if (companyId && entity.id === companyId) {
            try {
                const { data: summaryData } = await supabase
                    .schema('graph')
                    .from('entity_notes_rollup')
                    .select('latest_summary, last_updated')
                    .eq('entity_id', entity.id)
                    .single();
                
                if (summaryData) {
                    latestSummary = summaryData.latest_summary;
                    summaryDate = summaryData.last_updated;
                }
            } catch (err) {
                console.warn(`Failed to fetch notes rollup for ${entity.id}`, err);
            }
        }

        return {
            id: entity.id,
            name: entity.name,
            domain: entity.domain || enrichment.domain || analysis.website,
            industry: entity.industry || enrichment.industry || analysis.industry || (Array.isArray(enrichment.industries) ? enrichment.industries[0] : null),
            fund: entity.fund,
            location_city: entity.location_city || enrichment.location?.city || analysis.location?.city,
            location_country: entity.location_country || enrichment.location?.country || analysis.location?.country,
            investment_amount: entity.investment_amount,
            brief_description: entity.brief_description || entity.ai_summary || analysis.core_business || enrichment.description,
            taxonomy: entity.taxonomy,
            logo_url: entity.linkedin_url || enrichment.logo_url || enrichment.linkedin_url, // Map linkedin_url to logo_url for frontend
            status: entity.pipeline_stage,
            latest_summary: latestSummary,
            summary_updated_at: summaryDate
        };
    }));
    
    return NextResponse.json({ 
        companies,
        meta: { 
            source: 'graph.entities',
            filter: 'is_portfolio=true',
            timestamp: new Date().toISOString()
        } 
    });
    
  } catch (error) {
    console.error('Fetch portfolio companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio companies' }, { status: 500 });
  }
}
