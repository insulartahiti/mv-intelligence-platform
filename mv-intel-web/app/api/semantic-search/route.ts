import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function POST(request: NextRequest) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return NextResponse.json({ success: false, message: 'Missing configuration' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    try {
        const body = await request.json();
        const { query, limit = 20, filters = {} } = body as {
            query: string;
            limit?: number;
            filters?: SearchFilters;
        };

        if (!query || query.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: 'Query is required' },
                { status: 400 }
            );
        }

        console.log('🔍 Postgres Semantic Search Request:', { query, limit, filters });

        // Natural Language Taxonomy Extraction
        const lowerQuery = query.toLowerCase();
        const detectedTaxonomies: string[] = [];

        Object.entries(TAXONOMY_MAP).forEach(([keyword, code]) => {
            if (lowerQuery.includes(keyword)) {
                detectedTaxonomies.push(code);
            }
        });

        if (detectedTaxonomies.length > 0) {
            console.log('🏷️ Detected Taxonomies:', detectedTaxonomies);
            if (!filters.taxonomy) {
                filters.taxonomy = [];
            }
            // Add detected taxonomies if not already present
            detectedTaxonomies.forEach(code => {
                if (!filters.taxonomy!.includes(code)) {
                    filters.taxonomy!.push(code);
                }
            });
        }

        // Natural Language Entity Type Detection
        // If "people", "person", "who" is in the query -> infer type: "person"
        // If "company", "companies", "firm", "organization" -> infer type: "organization"
        const typeKeywords = {
            person: ['who', 'person', 'people', 'individual', 'founder', 'ceo', 'executive'],
            organization: ['company', 'companies', 'firm', 'agency', 'organization', 'startup', 'business']
        };

        let inferredType: string | null = null;
        const queryWords = lowerQuery.split(/\s+/); // Simple word tokenization

        // Check for person keywords
        if (typeKeywords.person.some(kw => queryWords.includes(kw))) {
            inferredType = 'person';
        }
        // Check for organization keywords (override if both present? usually context dependent, but let's be safe)
        // If user says "who founded company X", they want a person.
        // If user says "companies founded by X", they want companies.
        // For now, let's prioritize explicit type request if filters aren't set.
        else if (typeKeywords.organization.some(kw => queryWords.includes(kw))) {
            inferredType = 'organization';
        }

        if (inferredType && (!filters.types || filters.types.length === 0)) {
            console.log(`🧠 Inferred Entity Type: ${inferredType}`);
            filters.types = [inferredType];
        }

        // Natural Language Portfolio Detection
        const portfolioKeywords = ['portfolio', 'our portfolio', 'my portfolio', 'invested', 'investments'];
        if (portfolioKeywords.some(kw => lowerQuery.includes(kw))) {
            console.log('💼 Inferred Portfolio Filter');
            // We pass this as a special filter to the RPC
            // Note: We don't update filters.isPortfolio in the TS interface yet to avoid breaking types, 
            // but we pass it to the SQL function via filterJson.
            (filters as any).isPortfolio = true;
        }

        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);

        // Build filters as JSONB object (PostgREST-friendly approach)
        const filterJson: any = {};
        filterJson.queryText = query; // Always pass queryText for hybrid name matching
        if ((filters as any).isPortfolio) filterJson.isPortfolio = true;
        if (filters.countries) filterJson.countries = filters.countries;
        if (filters.industries) filterJson.industries = filters.industries;
        if (filters.types) filterJson.types = filters.types;
        if (filters.taxonomy) filterJson.taxonomy = filters.taxonomy;
        if (filters.seniority) filterJson.seniority = filters.seniority;
        if (filters.dateRange?.start) filterJson.dateStart = filters.dateRange.start;
        if (filters.dateRange?.end) filterJson.dateEnd = filters.dateRange.end;

        // Search in Postgres using pgvector with JSONB filters
        const { data: results, error } = await supabase.rpc('search_entities_filtered', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: limit,
            filters: filterJson
        });

        if (error) {
            console.error('Semantic search error:', error);
            // Return detailed error for debugging
            return NextResponse.json({
                success: false,
                message: error.message || 'Search failed',
                details: error.details || null,
                hint: error.hint || null
            }, { status: 500 });
        }

        // --- ENHANCEMENT: Fetch 1st Degree Connections for Top Results ---
        let enrichedResults = results || [];
        if (enrichedResults.length > 0) {
            const topEntityIds = enrichedResults.slice(0, 10).map((r: any) => r.id);
            const relatedEdges = await fetchRelatedEdges(topEntityIds, supabase);
            
            enrichedResults = enrichedResults.map((r: any) => ({
                ...r,
                related_edges: relatedEdges[r.id] || []
            }));
        }
        // -----------------------------------------------------------------

        return NextResponse.json({
            success: true,
            results: enrichedResults,
            query,
            filters,
            total: enrichedResults.length,
            searchType: 'postgres-vector-filtered'
        });

    } catch (error: any) {
        console.error('Semantic search error:', error);
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : 'Search failed'
            },
            { status: 500 }
        );
    }
}

// Fetch top related edges (competitors, partners) for a list of entity IDs
async function fetchRelatedEdges(entityIds: string[], supabase: any) {
    if (entityIds.length === 0) return {};

    // Get edges where these entities are the source
    const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select(`
            source, kind, target,
            target_ent:target(name, type, taxonomy)
        `)
        .in('source', entityIds)
        .limit(50); // Limit to avoid massive payloads

    if (error) {
        console.warn('Failed to fetch related edges:', error);
        return {};
    }

    // Group by source ID
    const edgesMap: Record<string, any[]> = {};
    edges?.forEach((edge: any) => {
        if (!edgesMap[edge.source]) {
            edgesMap[edge.source] = [];
        }
        edgesMap[edge.source].push({
            kind: edge.kind,
            target_name: edge.target_ent?.name,
            target_type: edge.target_ent?.type,
            target_id: edge.target
        });
    });

    return edgesMap;
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || 'test';
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    return POST(new NextRequest(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
    }));
}

// Interfaces & Constants
interface SearchFilters {
    countries?: string[];
    industries?: string[];
    types?: string[]; // "person" | "organization"
    taxonomy?: string[];
    seniority?: string[];
    dateRange?: {
        start?: string;
        end?: string;
    };
    isPortfolio?: boolean; // Can be inferred from query
}

const TAXONOMY_MAP: Record<string, string> = {
    'kyb': 'IFT.RCI.ID.KYB',
    'kyc': 'IFT.RCI.ID.KYC',
    'aml': 'IFT.RCI.REG.TMON',
    'compliance': 'IFT.RCI.REG.DYNAMIC_COMPLIANCE',
    'payments': 'IFT.PAY',
    'banking': 'IFT.DBK',
    'wealth': 'IFT.WLT',
    'crypto': 'IFT.CRYP',
    'insurance': 'IFT.INS'
};

async function generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API Key Missing');
    
    // ... OpenAI call logic ...
    // For now, returning a mock if key is missing during build (should be caught by API route check though)
    // But since this is a helper, let's just do the fetch
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: text,
            model: 'text-embedding-3-small'
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI Embedding Failed: ${response.statusText}`);
    }

    const json = await response.json();
    return json.data[0].embedding;
}
