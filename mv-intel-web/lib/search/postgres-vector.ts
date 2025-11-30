import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SearchFilters {
    countries?: string[];
    industries?: string[];
    types?: string[];
    taxonomy?: string[];
    seniority?: string[];
    isPortfolio?: boolean;
    queryText?: string;
    dateRange?: {
        start?: string;
        end?: string;
    };
}

export interface SearchResult {
    id: string;
    name: string;
    type: string;
    similarity: number;
    domain?: string;
    industry?: string;
    pipeline_stage?: string;
    taxonomy?: string;
    ai_summary?: string;
    importance?: number;
    location_country?: string;
    location_city?: string;
    updated_at?: string;
    business_analysis?: any;
    enrichment_source?: string;
    is_portfolio?: boolean;
    related_edges?: any[];
}

// Generate embedding using OpenAI
export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input: text,
            model: 'text-embedding-3-large',
            dimensions: 2000,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
}

// Fetch top related edges
async function fetchRelatedEdges(entityIds: string[]) {
    if (entityIds.length === 0) return {};

    const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select(`
            source,
            kind,
            confidence_score,
            target:target ( id, name, type, taxonomy )
        `)
        .in('source', entityIds)
        .order('confidence_score', { ascending: false })
        .limit(50);

    if (error) {
        console.warn('Failed to fetch related edges:', error);
        return {};
    }

    const edgesBySource: Record<string, any[]> = {};
    edges?.forEach((edge: any) => {
        if (!edgesBySource[edge.source]) {
            edgesBySource[edge.source] = [];
        }
        if (edgesBySource[edge.source].length < 10) { // Increased limit for chat context
             edgesBySource[edge.source].push({
                targetId: edge.target.id,
                targetName: edge.target.name,
                targetType: edge.target.type, // Added targetType
                relationship: edge.kind,
                confidence: edge.confidence_score
            });
        }
    });

    return edgesBySource;
}

// Main Search Function
export async function searchEntities(
    query: string, 
    options: { limit?: number } = {},
    filters: SearchFilters = {}
): Promise<SearchResult[]> {
    const limit = options.limit || 20;
    
    // Generate embedding
    const queryEmbedding = await generateEmbedding(query);

    // Build filters JSONB
    const filterJson: any = { ...filters };
    
    // Always ensure queryText is set for hybrid search boost
    if (!filterJson.queryText && query) {
        filterJson.queryText = query;
    }

    // RELAXATION: Remove fuzzy filters (industries, countries, taxonomy) from hard filtering
    // because the DB expects exact string matches, but data might be "Fintech; Startup" or "United Kingdom" vs "UK"
    // We rely on the Vector Search to handle these semantic matches.
    // We ONLY keep boolean flags or strict enums that we know are consistent.
    delete filterJson.industries;
    delete filterJson.countries;
    delete filterJson.taxonomy; 
    // Keep isPortfolio, dateRange, seniority (if strictly mapped)

    console.log(`🔎 Searching: "${query}" | Filters:`, JSON.stringify(filterJson));

    // Map date range to flat keys expected by SQL
    if (filters.dateRange?.start) filterJson.dateStart = filters.dateRange.start;
    if (filters.dateRange?.end) filterJson.dateEnd = filters.dateRange.end;

    // Execute RPC (Global Search)
    const vectorPromise = supabase.rpc('search_entities_filtered', {
        query_embedding: queryEmbedding,
        match_threshold: 0.1, // Lower threshold for text-embedding-3-large
        match_count: limit * 2, // Fetch more to allow re-ranking effectiveness
        filters: filterJson
    });

    // Parallel: Portfolio Search (Ensure portfolio items are always retrieved)
    const portfolioPromise = (async () => {
        // Don't run if the main filter already restricts to portfolio
        if (filters.isPortfolio) return { data: [] };
        
        return supabase.rpc('search_entities_filtered', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3, // stricter threshold for forced inclusion
            match_count: 10, // Grab top 10 relevant portfolio items
            filters: { ...filterJson, isPortfolio: true }
        });
    })();

    // Parallel: Keyword Search (Boost exact name matches)
    const keywordPromise = (async () => {
        // Only run if query is reasonably short
        if (query.length > 200) return [];
        
        let dbQuery = supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type, domain, industry, pipeline_stage, taxonomy, ai_summary, importance, location_country, location_city, updated_at, business_analysis, enrichment_source, is_portfolio')
            // Use websearch_to_tsquery to handle "what about Mark Gilbert" -> 'Mark' & 'Gilbert'
            // This works even without a specific index (sequential scan is fine for <100k rows)
            .textSearch('name', query, { type: 'websearch', config: 'english' })
            .limit(5);

        if (filters.types && filters.types.length > 0) {
            dbQuery = dbQuery.in('type', filters.types);
        }
        if (filters.isPortfolio) {
            dbQuery = dbQuery.eq('is_portfolio', true);
        }

        const { data, error } = await dbQuery;
        if (error) {
            console.warn('Keyword search error:', error.message);
            return [];
        }
        
        // Map to SearchResult format with high similarity
        return (data || []).map((e: any) => ({
            ...e,
            similarity: 1.1, // Artificial boost to ensure top ranking
            related_edges: []
        }));
    })();

    const [vectorResponse, portfolioResponse, keywordResults] = await Promise.all([vectorPromise, portfolioPromise, keywordPromise]);

    if (vectorResponse.error) {
        throw new Error(`Semantic search error: ${vectorResponse.error.message}`);
    }

    const vectorResults = vectorResponse.data || [];
    const portfolioResults = portfolioResponse.data || [];

    // Helper to calculate score with boosts
    const getBoostedScore = (item: any) => {
        let score = item.similarity;
        
        // Only apply boosts if there is a baseline relevance to avoid prioritizing noise
        if (score < 0.30) return score;

        // Boost Portfolio (+0.15)
        if (item.is_portfolio) {
            score += 0.15;
        }
        
        // Boost Founders (+0.10)
        // Check seniority, analysis, or title
        const analysis = item.business_analysis || {};
        const enrichment = item.enrichment_data || {};
        const title = (enrichment.title || '').toLowerCase();
        
        const isFounder = 
            title.includes('founder') || 
            title.includes('co-founder') ||
            analysis.seniority_level === 'Founder' ||
            (analysis.key_achievements || '').toLowerCase().includes('founder') ||
            (analysis.key_achievements || '').toLowerCase().includes('founded');

        if (isFounder) {
            score += 0.10;
        }
        
        return score;
    };

    // Merge results: Keyword -> Portfolio -> Vector (deduplicated)
    const mergedResults: SearchResult[] = [...keywordResults];
    const seenIds = new Set(keywordResults.map((r: any) => r.id));

    // Add Portfolio matches (if not already added by keyword)
    portfolioResults.forEach((r: any) => {
        if (!seenIds.has(r.id)) {
            mergedResults.push(r);
            seenIds.add(r.id);
        }
    });

    // Add Global Vector matches
    vectorResults.forEach((r: any) => {
        if (!seenIds.has(r.id)) {
            mergedResults.push(r);
            seenIds.add(r.id);
        }
    });

    // Sort by Boosted Score
    mergedResults.sort((a, b) => getBoostedScore(b) - getBoostedScore(a));

    // Apply Limit
    let enrichedResults = mergedResults.slice(0, limit);

    // Enrich with edges
    if (enrichedResults.length > 0) {
        const topEntityIds = enrichedResults.slice(0, 10).map((r: any) => r.id);
        const relatedEdges = await fetchRelatedEdges(topEntityIds);
        
        enrichedResults = enrichedResults.map((r: any) => ({
            ...r,
            related_edges: relatedEdges[r.id] || []
        }));
    }

    return enrichedResults;
}

