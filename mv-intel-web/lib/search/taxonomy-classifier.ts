/**
 * GPT-5.1 Taxonomy Classifier
 * 
 * Classifies search queries into IFT (Integrated Fintech Taxonomy) codes.
 * Uses strict predefined categories - no "discovered" categories allowed.
 */

import OpenAI from 'openai';

// Lazy initialization to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!openai) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

// Compact taxonomy schema for prompt injection
// Full hierarchy at docs/taxonomy.md - this is the searchable subset
const TAXONOMY_SCHEMA = `
## IFT Taxonomy Codes (use ONLY these codes)

### IFT.PAY - Money & Payments
- IFT.PAY.COM.GATEWAY - Payment gateways, PSPs, checkout (Stripe, Adyen, Checkout.com)
- IFT.PAY.COM.AGGREGATOR - Payment aggregators
- IFT.PAY.COM.POS_ACCESS - Point of Sale
- IFT.PAY.INF.CLEARING - Settlement & clearing
- IFT.PAY.INF.EMONEY_ISSUER - E-money issuers
- IFT.PAY.INF.MOBILE_MONEY - Mobile money
- IFT.PAY.OPSF.MONEY_TRANSFER - Remittance, P2P transfers
- IFT.PAY.OPSF.AP_AUTOMATION - Accounts payable
- IFT.PAY.OPSF.AR_AUTOMATION - Accounts receivable
- IFT.PAY.OPSF.SUPPLIER_FIN - Supply chain finance
- IFT.PAY.SRR.FRAUD_STACK - Payment fraud prevention

### IFT.DBK - Digital Banking
- IFT.DBK.RETAIL.NEO_BANK - Consumer neobanks (Monzo, Revolut, N26)
- IFT.DBK.MSME.NEO_BANK - SMB neobanks (Mercury, Brex)
- IFT.DBK.BAAS - Banking-as-a-Service (Unit, Treasury Prime)

### IFT.LEN - Digital Lending
- IFT.LEN.BSL.BUSINESS - Balance sheet business lending
- IFT.LEN.BSL.CONSUMER - Consumer lending
- IFT.LEN.BSL.PROPERTY - Mortgage/property lending
- IFT.LEN.P2P.BUSINESS - P2P business lending
- IFT.LEN.CASHADV.CUSTOMER - BNPL, consumer credit
- IFT.LEN.CASHADV.MERCHANT - Merchant cash advance
- IFT.LEN.DEBTSEC.INVOICE_TRADING - Invoice trading/factoring

### IFT.WLT - Wealth Management
- IFT.WLT.FO.INVEST - Robo-advisors, investment platforms (Betterment, Wealthfront)
- IFT.WLT.FO.CRM - Wealth CRM
- IFT.WLT.MO.COMPLIANCE - Wealth compliance
- IFT.WLT.BO.PMS - Portfolio management systems

### IFT.CRYP - Crypto & DeFi
- IFT.CRYP.EXCH.TRADE - Crypto exchanges (Coinbase, Kraken)
- IFT.CRYP.CUST.INST.THIRD_PARTY - Institutional custody
- IFT.CRYP.STBL.ISSUER.FIAT_BACKED - Stablecoin issuers (Circle, Tether)
- IFT.CRYP.STBL.INF.ONOFF_RAMP - On/off ramps (MoonPay, Ramp)

### IFT.INS - InsurTech
- IFT.INS.USAGE_BASED - Usage-based insurance
- IFT.INS.PARAMETRIC - Parametric insurance
- IFT.INS.DIGITAL_BROKERS_AGENTS - Digital insurance brokers
- IFT.INS.CLAIMS_RISK_MGMT - Claims management

### IFT.RCI - Risk, Compliance & Identity
- IFT.RCI.ID.KYC - KYC verification
- IFT.RCI.ID.KYB.UBO_DISCOVERY - KYB/UBO discovery
- IFT.RCI.ID.FRAUD.DEVICE_FP - Fraud detection, device fingerprinting
- IFT.RCI.REG.DYNAMIC_COMPLIANCE - Compliance automation (regtech)
- IFT.RCI.REG.TMON.REALTIME - Transaction monitoring (AML)
- IFT.RCI.REG.BLOCKCHAIN_FORENSICS - Blockchain analytics (Chainalysis)
- IFT.RCI.REG.RISK_ANALYTICS - Risk analytics

### IFT.OPS - Finance Ops & Treasury
- IFT.OPS.TREASURY.CASH - Cash management
- IFT.OPS.TREASURY.VIRTUAL_ACCOUNTS - Virtual accounts
- IFT.OPS.PAYOUTS.XB - Cross-border payouts
- IFT.OPS.RECON.AUTO - Automated reconciliation
- IFT.OPS.DATA.KYB.REGISTRY - Business registries

### IFT.ENT - Enterprise Tech
- IFT.ENT.AI_ML_NLP - AI/ML for finance
- IFT.ENT.API_MGMT - API management
- IFT.ENT.CLOUD - Cloud infrastructure
- IFT.ENT.DIGITAL_ACCOUNTING - Digital accounting

### IFT.MKT - Market Infrastructure
- IFT.MKT.SURV.TRADE - Trade surveillance
- IFT.MKT.REFDATA.MGMT - Reference data management
- IFT.MKT.COLLATERAL - Collateral management

### IFT.CAPR - Capital Raising
- IFT.CAPR.INV_CF.EQUITY - Equity crowdfunding
- IFT.CAPR.INV_CF.REAL_ESTATE - Real estate crowdfunding
`;

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
 * Classify a search query into IFT taxonomy codes using GPT-5.1
 * 
 * @param query - User's search query
 * @returns Classification result with codes, confidence, and extracted filters
 */
export async function classifyTaxonomy(query: string): Promise<TaxonomyClassification> {
    const client = getOpenAI();
    
    try {
        const completion = await client.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                {
                    role: "system",
                    content: `You are a fintech taxonomy classifier for a venture capital knowledge graph.

Given a user search query, identify which IFT (Integrated Fintech Taxonomy) categories are relevant.

${TAXONOMY_SCHEMA}

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
}`
                },
                { role: "user", content: query }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1, // Low temp for consistent classification
            max_tokens: 300
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            return { codes: [], confidence: 0, reasoning: 'No response from classifier' };
        }

        const result = JSON.parse(content);
        
        // Validate codes against known taxonomy
        const validCodes = (result.codes || []).filter((code: string) => 
            code.startsWith('IFT.') && !code.includes('UNKNOWN') && !code.includes('OTHER')
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
            return {
                codes: [code],
                confidence,
                reasoning: `Matched keyword: ${keywords.find(kw => lower.includes(kw))}`
            };
        }
    }

    return null; // No fast match, need LLM
}

/**
 * Hybrid taxonomy detection: Fast keyword check, then LLM fallback
 */
export async function detectTaxonomy(query: string): Promise<TaxonomyClassification> {
    // 1. Try fast keyword matching first
    const fastResult = classifyTaxonomyFast(query);
    if (fastResult && fastResult.confidence >= 0.85) {
        console.log(`🏷️ Taxonomy (fast): ${fastResult.codes} (${fastResult.reasoning})`);
        return fastResult;
    }

    // 2. Fallback to LLM classification
    const llmResult = await classifyTaxonomy(query);
    console.log(`🏷️ Taxonomy (LLM): ${llmResult.codes} (confidence: ${llmResult.confidence})`);
    return llmResult;
}

