import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
    try {
        // Determine columns based on common schemas
        // We assume the table exists.
        
        // Try to select using standard columns from migrations
        const typeCol = 'interaction_type';
        const contentCol = 'content_preview';
        
        // Check if embedding column exists by selecting it from one row (or check metadata if possible, but select is easier)
        // If select fails, we can't embed.
        
        const { data: interactions, error } = await supabase
            .schema('graph')
            .from('interactions')
            .select(`id, ${contentCol}, subject, ${typeCol}`)
            .is('embedding', null)
            .limit(20);

        if (error) {
            console.error('Error selecting interactions:', error);
            // Fallback: maybe 'type' and 'content'?
            if (error.message.includes('does not exist')) {
                 return NextResponse.json({ error: 'Schema mismatch: ' + error.message });
            }
            throw error;
        }

        if (!interactions?.length) return NextResponse.json({ message: 'No interactions to embed' });

        let count = 0;
        for (const note of interactions) {
            // access properties using dynamic keys
            const type = note[typeCol] || 'note';
            const content = note[contentCol] || '';
            const subject = note.subject || '';
            
            const text = `Type: ${type}\nSubject: ${subject}\nContent: ${content}`.trim();
            if (!text) continue;

            try {
                const response = await openai.embeddings.create({
                    model: 'text-embedding-3-large',
                    input: text,
                    dimensions: 2000
                });
                
                await supabase
                    .schema('graph')
                    .from('interactions')
                    .update({ embedding: response.data[0].embedding })
                    .eq('id', note.id);
                count++;
            } catch (e) {
                console.error(`Error embedding interaction ${note.id}:`, e);
            }
        }

        return NextResponse.json({ message: `Embedded ${count} interactions` });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
