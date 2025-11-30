import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    relevant_node_ids?: string[];
    graph_state_snapshot?: any;
}

export class ChatService {
    
    // 1. Create a new conversation
    async createConversation(userId?: string, initialTitle: string = 'New Conversation') {
        const { data, error } = await supabase
            .schema('graph')
            .from('conversations')
            .insert({ 
                title: initialTitle,
                user_id: userId,
                metadata: {} 
            })
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }

    // 2. Add message to conversation
    async addMessage(conversationId: string, message: ChatMessage) {
        const { data, error } = await supabase
            .schema('graph')
            .from('messages')
            .insert({
                conversation_id: conversationId,
                role: message.role,
                content: message.content,
                relevant_node_ids: message.relevant_node_ids || [],
                graph_state_snapshot: message.graph_state_snapshot || null
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // 3. Get history
    async getHistory(conversationId: string, limit: number = 20) {
        const { data, error } = await supabase
            .schema('graph')
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }) // Oldest first for context window
            .limit(limit);

        if (error) throw error;
        return data;
    }

    // 4. Query Rewriting & Intent Analysis (The "Brain")
    async rewriteQuery(conversationId: string, userQuery: string): Promise<{
        rewrittenQuery: string;
        intent: string;
        extractedEntities: string[];
    }> {
        // Fetch recent history
        const history = await this.getHistory(conversationId, 6); // Last 6 turns
        
        // Construct prompt
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        
        const systemPrompt = `
        You are an expert query understanding system for a Business Knowledge Graph.
        Your goal is to interpret the user's latest query in the context of the conversation history.
        
        TASKS:
        1. Resolve Coreferences: Replace "it", "them", "that company" with actual names from history.
        2. Clarify Intent: Is the user searching for entities, asking for a path/connection, or drilling into details?
        3. Extract Entities: Identify specific company names, people, or concepts mentioned.
        4. Extract Filters: Identify strict constraints.
           - isPortfolio: true if user asks for "our companies", "portfolio", "investments".
           - countries: Array of country codes/names (e.g. ["US", "Germany"]).
           - industries: Array of industries.
           - seniority: Array of ["Junior", "Mid-Level", "Senior", "Executive"].

        OUTPUT JSON:
        {
            "rewrittenQuery": "Full standalone search query",
            "intent": "SEARCH" | "PATH_FINDING" | "DRILL_DOWN" | "COMPARISON",
            "extractedEntities": ["Entity1", "Entity2"],
            "filters": {
                "isPortfolio": boolean | null,
                "countries": [],
                "industries": [],
                "seniority": []
            }
        }
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-5.1", // Using user preferred model
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `HISTORY:\n${historyText}\n\nUSER QUERY: ${userQuery}` }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        return result;
    }
}

