import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export interface NoteAnalysis {
    summary: string;
    risk_flags: string[];
    key_themes: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    action_items: string[];
}

export class NotesEnricher {
    async analyzeNote(content: string): Promise<NoteAnalysis> {
        if (!content || content.length < 10) {
            return { summary: '', risk_flags: [], key_themes: [], sentiment: 'neutral', action_items: [] };
        }

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-5.1", // As requested
                messages: [
                    {
                        role: "system",
                        content: `You are an expert VC associate analyzing meeting notes. 
                        Extract the following in JSON format:
                        1. summary: 1-2 sentence summary of the update/meeting.
                        2. risk_flags: Any concerns like "high churn", "co-founder conflict", "running out of cash", "regulatory issues".
                        3. key_themes: Themes like "AI infrastructure", "B2B Payments", "market expansion".
                        4. sentiment: positive, neutral, or negative.
                        5. action_items: Any todos or next steps mentioned.`
                    },
                    {
                        role: "user",
                        content: `Note Content:\n${content}`
                    }
                ],
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            return result as NoteAnalysis;

        } catch (error) {
            console.error('Error analyzing note:', error);
            return { summary: 'Analysis failed', risk_flags: [], key_themes: [], sentiment: 'neutral', action_items: [] };
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await openai.embeddings.create({
                model: 'text-embedding-3-large',
                input: text,
                dimensions: 2000
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating note embedding:', error);
            return [];
        }
    }
}

