require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const OpenAI = require('openai')
const pLimit = require('p-limit') // concurrency helper

// Initialize Postgres Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Initialize OpenAI client (Enterprise plan – high rate limits)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Initialize Perplexity client
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY || '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',
  baseURL: 'https://api.perplexity.ai'
})

class EnhancedPersonEmbeddingGenerator {
  constructor() {
    this.batchSize = 20               // Slightly larger batch for people (less text usually)
    this.concurrency = 15             // Higher concurrency (no web scraping needed)
    this.delayMs = 0                  // no artificial pause needed
    this.maxRetries = 3               // retry attempts for transient errors
    this.retryBaseDelay = 1000         // base back‑off in ms
    this.limit = pLimit(this.concurrency)
  }

  // ---------------------------------------------------------------------
  // Helper: retry with exponential back‑off
  // ---------------------------------------------------------------------
  async retry(fn, attempt = 0) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= this.maxRetries) throw err
      const backoff = this.retryBaseDelay * Math.pow(2, attempt)
      console.warn(`Retry ${attempt + 1}/${this.maxRetries} after ${backoff}ms – ${err.message}`)
      await new Promise(r => setTimeout(r, backoff))
      return this.retry(fn, attempt + 1)
    }
  }

  // ---------------------------------------------------------------------
  // Generate Expertise Analysis
  // Primary: Perplexity (Live Search)
  // Fallback: GPT-5.1 (Local Data)
  // ---------------------------------------------------------------------
  async generateExpertiseAnalysis(entity) {
    // Strategy 1: Perplexity Live Search (Primary)
    try {
      const employer = entity.enrichment_data?.current_employer || entity.enrichment_data?.organization_name || ''
      const title = entity.enrichment_data?.title || ''
      
      // Robust Context: If domain is present, use it. If not, try to fetch neighbor context.
      let context = '';
      if (entity.domain) {
        context = ` from ${entity.domain}`;
      } else if (!employer) {
        // Try to find network context (e.g. works_at, owner, deal_team edge)
        try {
           const neighbors = await pool.query(`
             SELECT t.name, t.domain, e.kind
             FROM graph.edges e 
             JOIN graph.entities t ON e.target = t.id 
             WHERE e.source = $1 
               AND t.type = 'organization'
               AND e.kind IN ('works_at', 'founder', 'board_member', 'advisor', 'partner', 'deal_team', 'owner', 'invests_in')
             LIMIT 3
           `, [entity.id]);
           
           if (neighbors.rows.length > 0) {
             // Prioritize 'works_at' or 'founder' if available, otherwise list them all
             const orgs = neighbors.rows.map(r => r.name).join(', ');
             const domains = neighbors.rows.filter(r => r.domain).map(r => r.domain).join(', ');
             context = ` associated with organizations: ${orgs}`;
             if (domains) context += ` (${domains})`;
             
             // Specific override for investors
             if (neighbors.rows.some(r => ['deal_team', 'owner', 'invests_in'].includes(r.kind))) {
                context += ". Likely an Investor/VC or Private Equity professional.";
             }
           }
        } catch (err) { /* ignore db error in enrichment loop */ }
      }

      const query = `Research professional: ${entity.name}${context} ${title} ${employer}`.trim()
      
      const prompt = `Research this professional and extract structured expertise data.
      
Subject: ${query}

Your goal is to enable a search system to find this person based on their skills, experience, and seniority.

Provide a JSON object with:
1. "functional_expertise": List of core functions (e.g., "Engineering Leadership", "B2B Sales").
2. "domain_expertise": List of specific industries/domains (e.g., "Fintech", "Crypto").
3. "seniority_level": "Executive", "Senior", "Mid-Level", or "Junior".
4. "years_experience_estimate": Integer estimate.
5. "key_achievements": A brief 1-sentence summary of their main value prop.

Format: JSON object only.`

      const response = await this.retry(async () => {
        return await perplexity.chat.completions.create({
          model: 'sonar', // Confirmed working model name
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        })
      })
      
      const content = response.choices[0].message.content
      // Robust JSON extraction: Find first '{' and last '}'
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return { data: JSON.parse(jsonMatch[0]), source: 'perplexity' }
      }
      // If no JSON found (e.g. "I don't know"), throw to trigger fallback
      throw new Error('No JSON object found in Perplexity response')
      
    } catch (pplxErr) {
      console.warn(`Perplexity failed for ${entity.name} (${pplxErr.message}), falling back to local data...`)
    }

    // Strategy 2: Local Data Analysis (Fallback)
    try {
      // Construct a rich profile from available data
      let profileText = `Name: ${entity.name}\n`
      
      if (entity.enrichment_data) {
        const e = entity.enrichment_data
        
        // standard fields
        if (e.title) profileText += `Current Title: ${e.title}\n`
        if (e.bio) profileText += `Bio: ${e.bio}\n`
        if (e.current_employer) profileText += `Employer: ${e.current_employer}\n`
        
        // Handle nested web_search_data which is often a stringified JSON
        if (e.web_search_data) {
          try {
            const webData = typeof e.web_search_data === 'string' 
              ? JSON.parse(e.web_search_data) 
              : e.web_search_data
              
            if (webData && webData.results && Array.isArray(webData.results)) {
              profileText += `\n--- Web Search Context ---\n`
              webData.results.slice(0, 3).forEach(result => {
                if (result.snippet) profileText += `${result.snippet}\n`
              })
            }
          } catch (parseErr) {
            // ignore parsing error
          }
        }
      }
      
      if (entity.employment_history && Array.isArray(entity.employment_history)) {
        const history = entity.employment_history
          .map(job => `${job.title} at ${job.company}`)
          .join('; ')
        profileText += `Employment History: ${history}\n`
      }
      
      if (entity.skills && Array.isArray(entity.skills)) {
        profileText += `Skills: ${entity.skills.join(', ')}\n`
      }

      if (entity.description) profileText += `Description: ${entity.description}\n`

      const prompt = `Analyze this professional profile and extract structured expertise data.

Profile:
${profileText.substring(0, 5000)}

Your goal is to enable a search system to find this person based on their skills, experience, and seniority.

Provide a JSON object with:
1. "functional_expertise": List of core functions (e.g., "Engineering Leadership", "B2B Sales", "Product Management").
2. "domain_expertise": List of specific industries/domains (e.g., "Fintech", "Real-time Payments", "Crypto", "SaaS").
3. "seniority_level": "Executive", "Senior", "Mid-Level", or "Junior".
4. "years_experience_estimate": Integer estimate (or null if impossible to guess).
5. "key_achievements": A brief 1-sentence summary of their main value prop.

Format: JSON object.`

      const response = await this.retry(async () => {
        return await openai.chat.completions.create({
          model: 'gpt-5.1',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      })

      return { data: JSON.parse(response.choices[0].message.content), source: 'local_fallback' }
    } catch (err) {
      console.error(`Error generating expertise analysis for ${entity.name}:`, err.message)
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Build the rich text representation for embedding
  // ---------------------------------------------------------------------
  buildRichPersonText(entity, analysis) {
    let text = `Professional: ${entity.name}\n`
    
    if (analysis) {
      text += `Seniority: ${analysis.seniority_level}\n`
      text += `Functional Expertise: ${analysis.functional_expertise.join(', ')}\n`
      text += `Domain Expertise: ${analysis.domain_expertise.join(', ')}\n`
      text += `Summary: ${analysis.key_achievements}\n`
    }
    
    // Add raw data as fallback/supplement
    if (entity.enrichment_data?.title) text += `Title: ${entity.enrichment_data.title}\n`
    if (entity.skills && entity.skills.length > 0) text += `Skills: ${entity.skills.join(', ')}\n`
    
    return text.trim()
  }

  // ---------------------------------------------------------------------
  // OpenAI embedding wrapper
  // ---------------------------------------------------------------------
  async generateEmbedding(text) {
    return this.retry(async () => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 2000
      })
      return response.data[0].embedding
    })
  }

  // ---------------------------------------------------------------------
  // Process a single person
  // ---------------------------------------------------------------------
  async processPerson(entity) {
    // 1. Generate Expertise Analysis
    const result = await this.generateExpertiseAnalysis(entity)
    let analysis = result?.data
    let enrichmentSource = result?.source || 'minimal_fallback'
    
    if (!analysis) {
      // Fallback to prevent failure
      console.warn(`Analysis failed for ${entity.name}, using fallback.`)
      analysis = {
        functional_expertise: [],
        domain_expertise: [],
        seniority_level: 'Unknown',
        years_experience_estimate: 0,
        key_achievements: entity.description || 'No detailed data available'
      }
      enrichmentSource = 'minimal_fallback'
    }
    
    // 2. Build rich text
    const richText = this.buildRichPersonText(entity, analysis)
    
    // 3. Generate embedding
    const taxonomyText = (analysis.functional_expertise || []).concat(analysis.domain_expertise || []).join(', ')
    
    const [richEmb, taxEmb] = await Promise.all([
      this.generateEmbedding(richText),
      this.generateEmbedding(taxonomyText || 'General Professional')
    ])
    
    return { 
      id: entity.id, 
      richEmb, 
      taxEmb, 
      analysis,
      enrichmentSource
    }
  }

  // ---------------------------------------------------------------------
  // DB update
  // ---------------------------------------------------------------------
  async updateEntityData({ id, richEmb, taxEmb, analysis, enrichmentSource }) {
    return this.retry(async () => {
      await pool.query(
        `UPDATE graph.entities 
         SET embedding = $1, taxonomy_embedding = $2, business_analysis = $3, taxonomy = 'PERSON', taxonomy_confidence = 1.0, enrichment_source = $4
         WHERE id = $5`,
        [JSON.stringify(richEmb), JSON.stringify(taxEmb), analysis, enrichmentSource, id]
      )
    })
  }

  // ---------------------------------------------------------------------
  // Progress tracking
  // ---------------------------------------------------------------------
  async recordStatus(id, status, attempts = 0, errorMsg = null) {
    await pool.query(
      `INSERT INTO embedding_status (entity_id, last_attempt, status, attempts, error_message)
       VALUES ($1, NOW(), $2, $3, $4)
       ON CONFLICT (entity_id) 
       DO UPDATE SET last_attempt = NOW(), status = $2, attempts = $3, error_message = $4`,
      [id, status, attempts, errorMsg]
    )
  }

  // ---------------------------------------------------------------------
  // Process batch
  // ---------------------------------------------------------------------
  async processBatch(entities) {
    const tasks = entities.map(e => this.limit(async () => {
      try {
        const result = await this.processPerson(e)
        if (result) {
          await this.updateEntityData(result)
          await this.recordStatus(e.id, 'completed', 1)
          console.log(`✅ Processed Person: ${e.name} (${result.analysis.seniority_level})`)
        } else {
          throw new Error('Analysis failed')
        }
      } catch (err) {
        console.error(`❌ Failed ${e.name}:`, err.message)
        await this.recordStatus(e.id, 'failed', 1, err.message)
      }
    }))
    
    await Promise.allSettled(tasks)
  }

  // ---------------------------------------------------------------------
  // Main driver
  // ---------------------------------------------------------------------
  async generateAllPeopleEmbeddings({ incremental = false, limit = null } = {}) {
    console.log('Starting AI-driven Person Embedding generation...')

    // Optimized: Fetch IDs first to avoid timeouts with large datasets
    let sql = `SELECT id FROM graph.entities WHERE type = 'person'`
    
    if (incremental) {
      sql += ` AND business_analysis IS NULL`
    }
    
    if (limit) {
      sql += ` LIMIT ${limit}`
    }

    console.log('Fetching candidate IDs...')
    const { rows: idRows } = await pool.query(sql)
    console.log(`Found ${idRows.length} people to process`)
    
    for (let i = 0; i < idRows.length; i += this.batchSize) {
      const batchIds = idRows.slice(i, i + this.batchSize).map(r => r.id)
      
      // Fetch full details for this batch only
      const { rows: batch } = await pool.query(
        `SELECT * FROM graph.entities WHERE id = ANY($1::uuid[])`,
        [batchIds]
      )
      
      console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(idRows.length / this.batchSize)}...`)
      await this.processBatch(batch)
      // Small pause
      await new Promise(r => setTimeout(r, 500))
    }
    console.log('Person generation completed')
    await pool.end()
  }
}

// CLI entry point
async function main() {
  const generator = new EnhancedPersonEmbeddingGenerator()
  const args = process.argv.slice(2)
  const incremental = args.includes('--incremental')
  
  let limit = null
  const limitIndex = args.indexOf('--limit')
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10)
  }
  
  await generator.generateAllPeopleEmbeddings({ incremental, limit })
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = EnhancedPersonEmbeddingGenerator
