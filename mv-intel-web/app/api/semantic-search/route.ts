import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SearchFilters {
    countries?: string[];
    industries?: string[];
    types?: string[];
    taxonomy?: string[];  // e.g., ['IFT.PAY.COM.GATEWAY', 'IFT.DBK.RETAIL.NEO_BANK']
    seniority?: string[];
    dateRange?: {
        start?: string;
        end?: string;
    };
}

const TAXONOMY_MAP: Record<string, string> = {
    // Payment & Banking (IFT.PAY)
    'payment gateway': 'IFT.PAY.COM.GATEWAY',
    'payment gateways': 'IFT.PAY.COM.GATEWAY',
    'checkout': 'IFT.PAY.COM.GATEWAY',
    'psp': 'IFT.PAY.COM.GATEWAY',
    'payment aggregator': 'IFT.PAY.COM.AGGREGATOR',
    'payment aggregators': 'IFT.PAY.COM.AGGREGATOR',
    'pos': 'IFT.PAY.COM.POS_ACCESS',
    'point of sale': 'IFT.PAY.COM.POS_ACCESS',
    'emoney': 'IFT.PAY.INF.EMONEY_ISSUER',
    'e-money': 'IFT.PAY.INF.EMONEY_ISSUER',
    'mobile money': 'IFT.PAY.INF.MOBILE_MONEY',
    'money transfer': 'IFT.PAY.OPSF.MONEY_TRANSFER',
    'p2p': 'IFT.PAY.OPSF.MONEY_TRANSFER',
    'remittance': 'IFT.PAY.OPSF.MONEY_TRANSFER',
    'accounts payable': 'IFT.PAY.OPSF.AP_AUTOMATION',
    'ap automation': 'IFT.PAY.OPSF.AP_AUTOMATION',
    'accounts receivable': 'IFT.PAY.OPSF.AR_AUTOMATION',
    'ar automation': 'IFT.PAY.OPSF.AR_AUTOMATION',
    'supplier financing': 'IFT.PAY.OPSF.SUPPLIER_FIN',
    'supply chain finance': 'IFT.PAY.OPSF.SUPPLIER_FIN',

    // Digital Banking (IFT.DBK)
    'neobank': 'IFT.DBK.RETAIL.NEO_BANK',
    'neo bank': 'IFT.DBK.RETAIL.NEO_BANK',
    'digital bank': 'IFT.DBK.RETAIL.NEO_BANK',
    'challenger bank': 'IFT.DBK.RETAIL.NEO_BANK',
    'baas': 'IFT.DBK.BAAS',
    'banking as a service': 'IFT.DBK.BAAS',

    // Lending (IFT.LEN)
    'lending': 'IFT.LEN.BSL.BUSINESS',
    'business lending': 'IFT.LEN.BSL.BUSINESS',
    'consumer lending': 'IFT.LEN.BSL.CONSUMER',
    'mortgage': 'IFT.LEN.BSL.PROPERTY',
    'property lending': 'IFT.LEN.BSL.PROPERTY',
    'p2p lending': 'IFT.LEN.P2P.BUSINESS',
    'peer to peer lending': 'IFT.LEN.P2P.BUSINESS',
    'bnpl': 'IFT.LEN.CASHADV.CUSTOMER',
    'buy now pay later': 'IFT.LEN.CASHADV.CUSTOMER',
    'merchant cash advance': 'IFT.LEN.CASHADV.MERCHANT',
    'invoice trading': 'IFT.LEN.DEBTSEC.INVOICE_TRADING',
    'invoice financing': 'IFT.LEN.DEBTSEC.INVOICE_TRADING',

    // Wealth Management (IFT.WLT)
    'wealth management': 'IFT.WLT.FO.INVEST',
    'wealthtech': 'IFT.WLT.FO.INVEST',
    'robo advisor': 'IFT.WLT.FO.INVEST.ROBO',
    'robo-advisor': 'IFT.WLT.FO.INVEST.ROBO',
    'portfolio management': 'IFT.WLT.BO.PMS',
    'asset management': 'IFT.WLT.FO.INVEST',
    'financial planning': 'IFT.WLT.BO.PLANNING',

    // Insurance (IFT.INS)
    'insurtech': 'IFT.INS.DIGITAL_BROKERS_AGENTS',
    'insurance': 'IFT.INS.DIGITAL_BROKERS_AGENTS',
    'parametric insurance': 'IFT.INS.PARAMETRIC',
    'usage based insurance': 'IFT.INS.USAGE_BASED',
    'p2p insurance': 'IFT.INS.P2P',

    // Crypto & Blockchain (IFT.CRYP)
    'crypto': 'IFT.CRYP.EXCH.TRADE',
    'cryptocurrency': 'IFT.CRYP.EXCH.TRADE',
    'crypto exchange': 'IFT.CRYP.EXCH.TRADE.ORDERBOOK',
    'dex': 'IFT.CRYP.EXCH.TRADE.DEX_RELAYER',
    'blockchain': 'IFT.ENT.ENTERPRISE_BLOCKCHAIN',
    'stablecoin': 'IFT.CRYP.STBL.ISSUER',
    'defi': 'IFT.CRYP.STBL.APP',
    'web3': 'IFT.CRYP.CUST.RET',
    'crypto wallet': 'IFT.CRYP.CUST.RET.HOSTED_WALLET',
    'crypto custody': 'IFT.CRYP.CUST.INST',

    // RegTech & Compliance (IFT.RCI)
    'regtech': 'IFT.RCI.REG.DYNAMIC_COMPLIANCE',
    'compliance': 'IFT.RCI.REG.DYNAMIC_COMPLIANCE',
    'kyc': 'IFT.RCI.ID.KYC',
    'know your customer': 'IFT.RCI.ID.KYC',
    'kyb': 'IFT.RCI.ID.KYB',
    'know your business': 'IFT.RCI.ID.KYB',
    'aml': 'IFT.RCI.REG.TMON',
    'anti money laundering': 'IFT.RCI.REG.TMON',
    'fraud detection': 'IFT.RCI.ID.FRAUD',
    'fraud prevention': 'IFT.RCI.ID.FRAUD',
    'sanctions screening': 'IFT.RCI.ID.SANCTIONS.SCREENING',
    'pep screening': 'IFT.RCI.ID.SANCTIONS.PEP',

    // Finance Operations (IFT.OPS)
    'treasury': 'IFT.OPS.TREASURY',
    'cash management': 'IFT.OPS.TREASURY.CASH',
    'reconciliation': 'IFT.OPS.RECON.AUTO',
    'virtual accounts': 'IFT.OPS.TREASURY.VIRTUAL_ACCOUNTS',
    'cross border payments': 'IFT.OPS.PAYOUTS.XB',

    // Enterprise (IFT.ENT)
    'api management': 'IFT.ENT.API_MGMT',
    'cloud': 'IFT.ENT.CLOUD',
    'ai ml': 'IFT.ENT.AI_ML_NLP',
    'artificial intelligence': 'IFT.ENT.AI_ML_NLP',
    'digital accounting': 'IFT.ENT.DIGITAL_ACCOUNTING',
    'e-invoicing': 'IFT.ENT.E_INVOICING',
    'accounting': 'IFT.ENT.DIGITAL_ACCOUNTING'
};

// Generate embedding using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
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

// Fetch top related edges (competitors, partners) for a list of entity IDs
async function fetchRelatedEdges(entityIds: string[]) {
    if (entityIds.length === 0) return {};

    // Get edges where these entities are the source
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
        .order('confidence_score', { ascending: false }) // Prioritize high confidence
        .limit(50); // Cap total edges for performance

    if (error) {
        console.warn('Failed to fetch related edges:', error);
        return {};
    }

    // Group by source ID
    const edgesBySource: Record<string, any[]> = {};
    edges?.forEach((edge: any) => {
        if (!edgesBySource[edge.source]) {
            edgesBySource[edge.source] = [];
        }
        // Limit to 5 per entity to keep payload small
        if (edgesBySource[edge.source].length < 5) {
             edgesBySource[edge.source].push({
                targetId: edge.target.id,
                targetName: edge.target.name,
                relationship: edge.kind,
                confidence: edge.confidence_score
            });
        }
    });

    return edgesBySource;
}

export async function POST(request: NextRequest) {
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
            const relatedEdges = await fetchRelatedEdges(topEntityIds);
            
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
