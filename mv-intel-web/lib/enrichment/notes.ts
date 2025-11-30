import OpenAI from 'openai';

export interface EnrichedNote {
    ai_summary: string;
    ai_sentiment: string;
    ai_key_points: string[];
    ai_action_items: string[];
    ai_risk_flags: string[];
    ai_themes: string[];
}

export async function enrichNoteWithAI(content: string): Promise<EnrichedNote> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    if (!content || content.length < 50) {
        return {
            ai_summary: content,
            ai_sentiment: 'neutral',
            ai_key_points: [],
            ai_action_items: [],
            ai_risk_flags: [],
            ai_themes: []
        };
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: "Analyze the following meeting note or interaction. Extract a summary, sentiment (positive, neutral, negative), key points, action items, risk flags, and themes. Return strictly valid JSON with keys: summary, sentiment, key_points, action_items, risk_flags, themes."
                },
                {
                    role: "user",
                    content: content
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');

        return {
            ai_summary: result.summary || content.substring(0, 200),
            ai_sentiment: result.sentiment || 'neutral',
            ai_key_points: result.key_points || [],
            ai_action_items: result.action_items || [],
            ai_risk_flags: result.risk_flags || [],
            ai_themes: result.themes || []
        };
    } catch (e) {
        console.error('Error enriching note:', e);
        return {
            ai_summary: content.substring(0, 200),
            ai_sentiment: 'neutral',
            ai_key_points: [],
            ai_action_items: [],
            ai_risk_flags: [],
            ai_themes: []
        };
    }
}