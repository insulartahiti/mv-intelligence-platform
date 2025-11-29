const { Pool } = require('pg');
const OpenAI = require('openai');
const axios = require('axios');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 2000,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
}

async function searchPerplexity(query) {
  try {
    console.log(`Create perplexity search for: ${query}`);
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a professional researcher. Find detailed professional background information about this person. Return ONLY a valid JSON object with keys: seniority_level, domain_expertise (array), key_achievements (string), functional_expertise (array), years_experience_estimate (number). No markdown formatting.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    // Clean markdown code blocks if present
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error('Perplexity search failed:', error.message);
    return null;
  }
}

async function processPerson(client, person) {
  console.log(`Processing ${person.name}...`);
  
  // 1. Search Perplexity
  const query = `Professional background and current role of ${person.name}${person.domain ? ` from ${person.domain}` : ''}. Focus on their expertise and career history.`;
  const analysis = await searchPerplexity(query);
  
  if (!analysis) {
    console.log(`Failed to enrich ${person.name}`);
    return;
  }

  // 2. Generate Embedding
  const textToEmbed = `
    Name: ${person.name}
    Role: ${analysis.seniority_level}
    Achievements: ${analysis.key_achievements}
    Expertise: ${analysis.functional_expertise?.join(', ')}
    Domains: ${analysis.domain_expertise?.join(', ')}
  `.trim();

  const embedding = await generateEmbedding(textToEmbed);

  // 3. Update DB
  await client.query(
    `UPDATE graph.entities 
     SET 
       business_analysis = $1, 
       embedding = $2, 
       enriched = true, 
       enrichment_source = 'perplexity_forced',
       last_enriched_at = NOW()
     WHERE id = $3`,
    [analysis, JSON.stringify(embedding), person.id]
  );
  
  console.log(`✅ Successfully enriched ${person.name}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const ids = [
      'd80242a2-70d5-f547-0e94-096445c4ca0b' // Thomas Harris
    ];

    for (const id of ids) {
      const res = await client.query('SELECT * FROM graph.entities WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        await processPerson(client, res.rows[0]);
      }
    }
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
