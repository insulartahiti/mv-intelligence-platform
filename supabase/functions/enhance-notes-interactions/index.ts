import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface InteractionSummary {
  id: string;
  type: string;
  subject: string;
  content_preview: string;
  participants: string[];
  started_at: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  key_points: string[];
  action_items: string[];
  embedding: number[];
}

interface NotesRollup {
  entity_id: string;
  latest_summary: string;
  notes_count: number;
  last_updated: string;
  key_themes: string[];
  sentiment_overview: string;
  embedding: number[];
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text,
      encoding_format: 'float'
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function summarizeInteraction(interaction: any): Promise<InteractionSummary> {
  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that analyzes business interactions and creates structured summaries. 
          Analyze the interaction and provide:
          1. A concise summary (2-3 sentences)
          2. Sentiment analysis (positive/neutral/negative)
          3. Key points (3-5 bullet points)
          4. Action items (if any)
          
          Be professional and focus on business value.`
        },
        {
          role: 'user',
          content: `Analyze this interaction:
          
          Type: ${interaction.interaction_type}
          Subject: ${interaction.subject || 'No subject'}
          Content: ${interaction.content_preview || 'No content available'}
          Participants: ${interaction.participants?.join(', ') || 'Unknown'}
          Date: ${interaction.started_at}
          
          Provide a structured analysis.`
        }
      ],
      temperature: 0.3
    })
  });

  const analysis = await openaiResponse.json();
  const content = analysis.choices[0].message.content;
  
  // Parse the structured response
  const summaryMatch = content.match(/Summary:\s*(.+?)(?=\n|$)/s);
  const sentimentMatch = content.match(/Sentiment:\s*(positive|neutral|negative)/i);
  const keyPointsMatch = content.match(/Key Points:\s*([\s\S]*?)(?=\nAction Items:|$)/s);
  const actionItemsMatch = content.match(/Action Items:\s*([\s\S]*?)$/s);

  const summary = summaryMatch?.[1]?.trim() || 'No summary available';
  const sentiment = (sentimentMatch?.[1]?.toLowerCase() as 'positive' | 'neutral' | 'negative') || 'neutral';
  
  const keyPoints = keyPointsMatch?.[1]
    ?.split('\n')
    .map(point => point.replace(/^[-•*]\s*/, '').trim())
    .filter(point => point.length > 0)
    .slice(0, 5) || [];
    
  const actionItems = actionItemsMatch?.[1]
    ?.split('\n')
    .map(item => item.replace(/^[-•*]\s*/, '').trim())
    .filter(item => item.length > 0)
    .slice(0, 3) || [];

  // Generate embedding for the full interaction content
  const fullContent = `${interaction.interaction_type}: ${interaction.subject || ''} - ${interaction.content_preview || ''}`;
  const embedding = await generateEmbedding(fullContent);

  return {
    id: interaction.id,
    type: interaction.interaction_type,
    subject: interaction.subject || '',
    content_preview: interaction.content_preview || '',
    participants: interaction.participants || [],
    started_at: interaction.started_at,
    summary,
    sentiment,
    key_points: keyPoints,
    action_items: actionItems,
    embedding
  };
}

async function createNotesRollup(entityId: string, interactions: InteractionSummary[]): Promise<NotesRollup> {
  if (interactions.length === 0) {
    return {
      entity_id: entityId,
      latest_summary: 'No recent interactions',
      notes_count: 0,
      last_updated: new Date().toISOString(),
      key_themes: [],
      sentiment_overview: 'neutral',
      embedding: await generateEmbedding('No recent interactions')
    };
  }

  // Group interactions by recent time periods
  const recentInteractions = interactions
    .filter(i => new Date(i.started_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .slice(0, 10); // Last 10 interactions

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that creates executive summaries of business interactions. 
          Analyze the provided interactions and create a comprehensive rollup that includes:
          1. Executive summary (3-4 sentences)
          2. Key themes (3-5 main topics)
          3. Overall sentiment assessment
          
          Focus on business insights and relationship dynamics.`
        },
        {
          role: 'user',
          content: `Create an executive summary for these interactions:
          
          ${recentInteractions.map(i => `
          ${i.type} - ${i.subject}
          Date: ${i.started_at}
          Summary: ${i.summary}
          Sentiment: ${i.sentiment}
          Key Points: ${i.key_points.join(', ')}
          `).join('\n')}
          
          Provide a structured analysis.`
        }
      ],
      temperature: 0.3
    })
  });

  const analysis = await openaiResponse.json();
  const content = analysis.choices[0].message.content;
  
  const summaryMatch = content.match(/Executive Summary:\s*(.+?)(?=\n|$)/s);
  const themesMatch = content.match(/Key Themes:\s*([\s\S]*?)(?=\n|$)/s);
  const sentimentMatch = content.match(/Overall Sentiment:\s*(positive|neutral|negative)/i);

  const latest_summary = summaryMatch?.[1]?.trim() || 'Summary not available';
  const sentiment_overview = (sentimentMatch?.[1]?.toLowerCase() as 'positive' | 'neutral' | 'negative') || 'neutral';
  
  const key_themes = themesMatch?.[1]
    ?.split('\n')
    .map(theme => theme.replace(/^[-•*]\s*/, '').trim())
    .filter(theme => theme.length > 0)
    .slice(0, 5) || [];

  // Generate embedding for the rollup
  const rollupContent = `${latest_summary} Themes: ${key_themes.join(', ')}`;
  const embedding = await generateEmbedding(rollupContent);

  return {
    entity_id: entityId,
    latest_summary,
    notes_count: interactions.length,
    last_updated: new Date().toISOString(),
    key_themes: key_themes,
    sentiment_overview,
    embedding
  };
}

Deno.serve(async (req) => {
  try {
    const { entityId, processAll = false } = await req.json();

    if (!entityId && !processAll) {
      return new Response(JSON.stringify({ error: 'entityId required or set processAll=true' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let processedCount = 0;
    let errorCount = 0;

    if (processAll) {
      // Process all entities with interactions
      const { data: entities } = await supabase
        .from('interactions')
        .select('company_id, person_id')
        .not('company_id', 'is', null)
        .not('person_id', 'is', null);

      const entityIds = [...new Set([
        ...(entities?.map(e => e.company_id).filter(Boolean) || []),
        ...(entities?.map(e => e.person_id).filter(Boolean) || [])
      ])];

      for (const id of entityIds.slice(0, 10)) { // Limit to 10 for testing
        try {
          await processEntityInteractions(id);
          processedCount++;
        } catch (error) {
          console.error(`Error processing entity ${id}:`, error);
          errorCount++;
        }
      }
    } else {
      // Process specific entity
      await processEntityInteractions(entityId);
      processedCount = 1;
    }

    async function processEntityInteractions(entityId: string) {
      // Get interactions for this entity
      const { data: interactions } = await supabase
        .from('interactions')
        .select('*')
        .or(`company_id.eq.${entityId},person_id.eq.${entityId}`)
        .order('started_at', { ascending: false });

      if (!interactions || interactions.length === 0) {
        console.log(`No interactions found for entity ${entityId}`);
        return;
      }

      // Summarize each interaction
      const summarizedInteractions: InteractionSummary[] = [];
      for (const interaction of interactions) {
        try {
          const summary = await summarizeInteraction(interaction);
          summarizedInteractions.push(summary);
          
          // Update interaction with summary
          await supabase
            .from('interactions')
            .update({
              summary: summary.summary,
              sentiment: summary.sentiment,
              key_points: summary.key_points,
              action_items: summary.action_items,
              embedding: summary.embedding
            })
            .eq('id', interaction.id);
        } catch (error) {
          console.error(`Error summarizing interaction ${interaction.id}:`, error);
        }
      }

      // Create notes rollup
      const notesRollup = await createNotesRollup(entityId, summarizedInteractions);
      
      // Upsert notes rollup
      await supabase
        .from('entity_notes_rollup')
        .upsert({
          entity_id: entityId,
          latest_summary: notesRollup.latest_summary,
          notes_count: notesRollup.notes_count,
          last_updated: notesRollup.last_updated,
          key_themes: notesRollup.key_themes,
          sentiment_overview: notesRollup.sentiment_overview,
          embedding: notesRollup.embedding
        }, { onConflict: 'entity_id' });

      console.log(`Processed ${summarizedInteractions.length} interactions for entity ${entityId}`);
    }

    return new Response(JSON.stringify({
      success: true,
      processedCount,
      errorCount,
      message: `Successfully processed ${processedCount} entities`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in enhance-notes-interactions:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
