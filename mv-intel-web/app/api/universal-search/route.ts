import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/lib/search/intent';
import { detectTaxonomy } from '@/lib/search/taxonomy-classifier';

export const dynamic = 'force-dynamic';

import { searchEntities, SearchFilters } from '@/lib/search/postgres-vector';

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

        // 1. Parallel: Intent Classification + Taxonomy Detection
        const [classification, taxonomyResult] = await Promise.all([
            classifyIntent(query),
            detectTaxonomy(query)
        ]);
        
        console.log('🤖 Detected Intent:', classification);
        console.log('🏷️ Taxonomy Result:', taxonomyResult);

        // 2. Apply taxonomy codes to filters (if confident)
        if (taxonomyResult.codes.length > 0 && taxonomyResult.confidence >= 0.7) {
            if (!filters.taxonomy) filters.taxonomy = [];
            taxonomyResult.codes.forEach(code => {
                if (!filters.taxonomy!.includes(code)) filters.taxonomy!.push(code);
            });
        }

        // Apply extracted filters from taxonomy classifier
        if (taxonomyResult.filters) {
            if (taxonomyResult.filters.types && !filters.types) {
                filters.types = taxonomyResult.filters.types;
            }
            if (taxonomyResult.filters.countries && !filters.countries) {
                filters.countries = taxonomyResult.filters.countries;
            }
            if (taxonomyResult.filters.isPortfolio) {
                filters.isPortfolio = true;
            }
        }

        const lowerQuery = query.toLowerCase();

        // 3. Additional filter inference from query keywords
        const typeKeywords = {
            person: ['who', 'person', 'people', 'individual', 'founder', 'ceo'],
            organization: ['company', 'companies', 'firm', 'agency']
        };
        if (!filters.types) {
            if (typeKeywords.person.some(kw => lowerQuery.includes(kw))) {
                filters.types = ['person'];
            } else if (typeKeywords.organization.some(kw => lowerQuery.includes(kw))) {
                filters.types = ['organization'];
            }
        }

        // Portfolio Inference
        if (['portfolio', 'invested', 'investments', 'my portfolio', 'our portfolio'].some(kw => lowerQuery.includes(kw))) {
            filters.isPortfolio = true;
        }

        // 4. Execute search
        const results = await searchEntities(query, { limit }, filters);

        return NextResponse.json({
            success: true,
            intent: classification.intent,
            taxonomy: taxonomyResult.codes.length > 0 ? {
                codes: taxonomyResult.codes,
                confidence: taxonomyResult.confidence,
                reasoning: taxonomyResult.reasoning
            } : undefined,
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

