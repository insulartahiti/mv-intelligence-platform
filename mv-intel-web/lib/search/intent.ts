import OpenAI from 'openai';

// Lazy load OpenAI
let openaiInstance: OpenAI | null = null;
function getOpenAI() {
    if (!openaiInstance) {
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiInstance;
}

export type SearchIntent = 'ENTITY_LOOKUP' | 'RELATIONSHIP_QUERY' | 'MARKET_INSIGHT';

export interface IntentResult {
    intent: SearchIntent;
    confidence: number;
    extractedParams?: Record<string, any>;
}

const SYSTEM_PROMPT = `You are a search intent classifier for a Fintech Knowledge Graph.
Classify the user's query into one of three categories:

1. ENTITY_LOOKUP: The user is looking for a specific company, person, or companies in a specific sector.
   - Examples: "Steward", "Fintech companies in London", "Who is Julia Hubo?", "Portfolio companies in payments"
   - Key intent: Finding nodes.

2. RELATIONSHIP_QUERY: The user is asking about connections, paths, or specific relationships between entities.
   - Examples: "Who knows the CEO of Steward?", "How do I get introduced to Penta?", "Investors in PrimaryBid", "Who worked at Stripe and now works at Steward?"
   - Key intent: Finding paths or edges.

3. MARKET_INSIGHT: The user is asking for a summary, trend analysis, or synthesis of information.
   - Examples: "Summarize our crypto exposure", "What are the trends in Neobanking?", "Why is Steward a good investment?"
   - Key intent: Generating new information/analysis.

Return a JSON object: { "intent": "CATEGORY", "confidence": 0.9, "params": {} }`;

export async function classifyIntent(query: string): Promise<IntentResult> {
    // 1. Heuristics (Fast Path)
    const lower = query.toLowerCase();
    
    // Graph/Path Keywords
    if (lower.includes('who knows') || 
        lower.includes('how do i get to') || 
        lower.includes('intro to') || 
        lower.includes('connected to') ||
        lower.match(/investors? in/) || 
        lower.match(/worked? at/)) {
        return { intent: 'RELATIONSHIP_QUERY', confidence: 0.8 };
    }

    // Insight/RAG Keywords
    if (lower.startsWith('summarize') || 
        lower.startsWith('explain') || 
        lower.includes('trends in') || 
        lower.includes('analysis of')) {
        return { intent: 'MARKET_INSIGHT', confidence: 0.8 };
    }

    // 2. LLM Fallback (Slow Path - skipped for MVP to keep latency low, assuming default is ENTITY)
    // For the "Universal Search Agent" roadmap, we would uncomment this or use a smaller model.
    /*
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query }
        ],
        response_format: { type: "json_object" }
    });
    return JSON.parse(completion.choices[0].message.content || "{}");
    */

    // Default to Entity Search
    return { intent: 'ENTITY_LOOKUP', confidence: 0.5 };
}

