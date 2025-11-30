import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load env
const envPath = path.resolve(__dirname, '../mv-intel-web/.env.local');
console.log('Loading .env.local from:', envPath);
dotenv.config({ path: envPath });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.OPENAI_API_KEY) {
    console.error('Missing env vars. Please ensure .env.local is accessible.');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embedInteractions() {
    console.log('Fetching interactions needing embedding...');
    
    const { data: interactions, error } = await supabase
        .schema('graph')
        .from('interactions')
        .select('id, content, subject, type')
        .is('embedding', null)
        .limit(50);

    if (error) {
        console.error('Error fetching interactions:', error);
        return;
    }

    if (!interactions || interactions.length === 0) {
        console.log('No interactions found needing embedding.');
        return;
    }

    console.log(`Found ${interactions.length} interactions to embed.`);

    for (const note of interactions) {
        const text = `Type: ${note.type}\nSubject: ${note.subject || ''}\nContent: ${note.content || ''}`.trim();
        if (!text) continue;

        try {
            const response = await openai.embeddings.create({
                model: 'text-embedding-3-large',
                input: text,
                dimensions: 2000
            });
            
            const embedding = response.data[0].embedding;

            // Update
            const { error: updateError } = await supabase
                .schema('graph')
                .from('interactions')
                .update({ embedding: embedding })
                .eq('id', note.id);

            if (updateError) {
                console.error(`Failed to update note ${note.id}:`, updateError.message);
            } else {
                console.log(`Embedded interaction ${note.id}`);
            }
        } catch (err: any) {
            console.error(`Failed to embed note ${note.id}:`, err.message);
        }
    }
}

embedInteractions();

