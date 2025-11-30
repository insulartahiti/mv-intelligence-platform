import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/lib/search/intent';

export const dynamic = 'force-dynamic';

import { searchEntities, SearchFilters } from '@/lib/search/postgres-vector';
import { generateAndExecuteCypher } from '@/lib/search/cypher-generator';
import { generateMarketInsight } from '@/lib/search/rag-service';

// TAXONOMY_MAP (Copied for now, ideal to move to a shared constant file)
const TAXONOMY_MAP: Record<string, string> = {
    'payment gateway': 'IFT.PAY.COM.GATEWAY',
    'neobank': 'IFT.DBK.RETAIL.NEO_BANK',
    'wealthtech': 'IFT.WLT.FO.INVEST',
    'insurtech': 'IFT.INS.DIGITAL_BROKERS_AGENTS',
    'crypto': 'IFT.CRYP.EXCH.TRADE',
    'regtech': 'IFT.RCI.REG.DYNAMIC_COMPLIANCE',
    'ai ml': 'IFT.ENT.AI_ML_NLP',
    // ... (Can import full map later)
};

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

        console.log('🌌 Universal Search Request:', { query });

        // 1. Intent Classification
        const classification = await classifyIntent(query);
        console.log('🤖 Detected Intent:', classification);

        // 2. Pre-processing (Common for all intents)
        const lowerQuery = query.toLowerCase();
        
        // Taxonomy Detection (Simplified for brevity, can share logic)
        const detectedTaxonomies: string[] = [];
        Object.entries(TAXONOMY_MAP).forEach(([keyword, code]) => {
            if (lowerQuery.includes(keyword)) detectedTaxonomies.push(code);
        });
        if (detectedTaxonomies.length > 0) {
            if (!filters.taxonomy) filters.taxonomy = [];
            detectedTaxonomies.forEach(code => {
                if (!filters.taxonomy!.includes(code)) filters.taxonomy!.push(code);
            });
        }

        // 3. Routing
        let results: any = {};
        
        switch (classification.intent) {
            case 'RELATIONSHIP_QUERY':
                console.log('🔗 Executing Text-to-Cypher Search...');
                try {
                    const graphResults = await generateAndExecuteCypher(query);
                    results = {
                        searchType: 'graph-cypher',
                        data: graphResults.results,
                        cypher: graphResults.cypher
                    };
                } catch (err) {
                    console.error('Text-to-Cypher failed, falling back to Entity Search:', err);
                    // Fallback to standard entity search if graph query fails
                    const entityResults = await searchEntities(query, limit, filters);
                    results = {
                        ...entityResults,
                        fallback: true,
                        error: (err as Error).message
                    };
                }
                break;

            case 'MARKET_INSIGHT':
                console.log('🧠 Executing Graph RAG Search...');
                const history = (body as any).history || [];
                try {
                    // Pass filters and history to RAG service
                    const insight = await generateMarketInsight(query, filters, history);
                    results = {
                        searchType: 'market-insight',
                        data: insight,
                        // We also return standard results to show below the insight
                        ...(await searchEntities(query, 5, filters))
                    };
                } catch (err) {
                    console.error('Graph RAG failed, falling back to Entity Search:', err);
                    const entityResults = await searchEntities(query, limit, filters);
                    results = {
                        ...entityResults,
                        fallback: true,
                        error: (err as Error).message
                    };
                }
                break;

            case 'ENTITY_LOOKUP':
            default:
                // Entity Type Inference
                const typeKeywords = {
                    person: ['who', 'person', 'people', 'individual', 'founder', 'ceo'],
                    organization: ['company', 'companies', 'firm', 'agency']
                };
                if (typeKeywords.person.some(kw => lowerQuery.includes(kw))) {
                    if (!filters.types) filters.types = ['person'];
                } else if (typeKeywords.organization.some(kw => lowerQuery.includes(kw))) {
                    if (!filters.types) filters.types = ['organization'];
                }

                // Portfolio Inference
                if (['portfolio', 'invested', 'investments'].some(kw => lowerQuery.includes(kw))) {
                    filters.isPortfolio = true;
                }

                results = await searchEntities(query, limit, filters);
                break;
        }

        return NextResponse.json({
            success: true,
            intent: classification.intent,
            ...results
        });

    } catch (error: any) {
        console.error('Universal search error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Search failed' },
            { status: 500 }
        );
    }
}

