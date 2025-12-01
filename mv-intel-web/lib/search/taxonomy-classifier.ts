/**
 * GPT-5.1 Taxonomy Classifier
 * 
 * Classifies search queries into IFT (Integrated Fintech Taxonomy) codes.
 * Uses strict predefined categories - no "discovered" categories allowed.
 * 
 * Uses centralized taxonomy schema from lib/taxonomy/schema.ts
 */

import OpenAI from 'openai';
import { TAXONOMY_PROMPT_SCHEMA, isValidTaxonomyCode } from '@/lib/taxonomy/schema';

// Lazy initialization to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!openai) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

export interface TaxonomyClassification {
    codes: string[];
    confidence: number;
    reasoning: string;
    filters?: {
        types?: ('person' | 'organization')[];
        countries?: string[];
        isPortfolio?: boolean;
    };
}

/**
 * Minimum confidence threshold for applying taxonomy codes.
 * This constant is used by both the classifier and consumers
 * to ensure consistent behavior.
 */
export const TAXONOMY_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Classify a search query into IFT taxonomy codes using GPT-5.1
 */
export async function classifyTaxonomy(query: string): Promise<TaxonomyClassification> {
    const client = getOpenAI();
    
    const systemPrompt = `You are a fintech taxonomy classifier for a venture capital knowledge graph.

Given a user search query, identify which IFT (Integrated Fintech Taxonomy) categories are relevant.

${TAXONOMY_PROMPT_SCHEMA}

RULES:
1. Return ONLY codes from the list above - do NOT invent new codes
2. Return 1-3 most relevant codes (prefer fewer, more precise matches)
3. If query mentions a SPECIFIC company name (not a category), return empty codes array
4. Use parent codes (e.g., "IFT.PAY") if query is broad
5. Extract any implicit filters (country, entity type, portfolio status)
6. Set confidence < 0.5 if query doesn't clearly map to any category

Return JSON:
{
  "codes": ["IFT.XXX.YYY", ...],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "filters": {
    "types": ["organization"] or ["person"] if implied,
    "countries": ["Germany", ...] if location mentioned,
    "isPortfolio": true if "my portfolio" or "our investments" mentioned
  }
}`;

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 300
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            return { codes: [], confidence: 0, reasoning: 'No response from classifier' };
        }

        const result = JSON.parse(content);
        
        // Validate codes against centralized taxonomy schema
        const validCodes = (result.codes || []).filter((code: string) => 
            isValidTaxonomyCode(code)
        );

        return {
            codes: validCodes,
            confidence: result.confidence || 0,
            reasoning: result.reasoning || '',
            filters: result.filters
        };

    } catch (error) {
        console.error('Taxonomy classification error:', error);
        return { codes: [], confidence: 0, reasoning: 'Classification failed' };
    }
}

/**
 * Fast keyword-based taxonomy detection (fallback for common queries)
 * Use this first before LLM to save latency/cost on obvious queries
 */
export function classifyTaxonomyFast(query: string): TaxonomyClassification | null {
    const lower = query.toLowerCase();
    
    // Fast path mappings
    const mappings: Array<{ keywords: string[], code: string, confidence: number }> = [
        { keywords: ['payment gateway', 'psp', 'checkout provider'], code: 'IFT.PAY.COM.GATEWAY', confidence: 0.9 },
        { keywords: ['neobank', 'digital bank', 'challenger bank'], code: 'IFT.DBK.RETAIL.NEO_BANK', confidence: 0.9 },
        { keywords: ['baas', 'banking as a service', 'embedded banking'], code: 'IFT.DBK.BAAS', confidence: 0.9 },
        { keywords: ['bnpl', 'buy now pay later'], code: 'IFT.LEN.CASHADV.CUSTOMER', confidence: 0.9 },
        { keywords: ['robo advisor', 'wealthtech', 'wealth management'], code: 'IFT.WLT.FO.INVEST', confidence: 0.85 },
        { keywords: ['crypto exchange', 'cryptocurrency exchange'], code: 'IFT.CRYP.EXCH.TRADE', confidence: 0.9 },
        { keywords: ['stablecoin'], code: 'IFT.CRYP.STBL.ISSUER.FIAT_BACKED', confidence: 0.85 },
        { keywords: ['kyc', 'identity verification'], code: 'IFT.RCI.ID.KYC', confidence: 0.9 },
        { keywords: ['aml', 'anti-money laundering', 'transaction monitoring'], code: 'IFT.RCI.REG.TMON.REALTIME', confidence: 0.85 },
        { keywords: ['regtech', 'compliance automation'], code: 'IFT.RCI.REG.DYNAMIC_COMPLIANCE', confidence: 0.85 },
        { keywords: ['blockchain analytics', 'crypto compliance'], code: 'IFT.RCI.REG.BLOCKCHAIN_FORENSICS', confidence: 0.9 },
        { keywords: ['insurtech', 'insurance technology'], code: 'IFT.INS.DIGITAL_BROKERS_AGENTS', confidence: 0.8 },
        { keywords: ['invoice trading', 'invoice factoring'], code: 'IFT.LEN.DEBTSEC.INVOICE_TRADING', confidence: 0.9 },
        { keywords: ['merchant cash advance', 'mca'], code: 'IFT.LEN.CASHADV.MERCHANT', confidence: 0.9 },
    ];

    for (const { keywords, code, confidence } of mappings) {
        if (keywords.some(kw => lower.includes(kw))) {
            const matchedKeyword = keywords.find(kw => lower.includes(kw));
            return {
                codes: [code],
                confidence,
                reasoning: `Matched keyword: ${matchedKeyword}`
            };
        }
    }

    return null; // No fast match, need LLM
}

/**
 * Hybrid taxonomy detection: Fast keyword check, then LLM fallback
 * 
 * Uses TAXONOMY_CONFIDENCE_THRESHOLD to decide whether fast results are 
 * "good enough" to skip LLM. This threshold aligns with the consumer's
 * threshold in universal-search/route.ts for consistent behavior.
 */
export async function detectTaxonomy(query: string): Promise<TaxonomyClassification> {
    // 1. Try fast keyword matching first
    const fastResult = classifyTaxonomyFast(query);
    if (fastResult && fastResult.confidence >= TAXONOMY_CONFIDENCE_THRESHOLD) {
        console.log(`🏷️ Taxonomy (fast): ${fastResult.codes} (${fastResult.reasoning})`);
        return fastResult;
    }

    // 2. Fallback to LLM classification
    const llmResult = await classifyTaxonomy(query);
    console.log(`🏷️ Taxonomy (LLM): ${llmResult.codes} (confidence: ${llmResult.confidence})`);
    return llmResult;
}
