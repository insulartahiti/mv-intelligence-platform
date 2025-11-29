require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const OpenAI = require('openai')
const pLimit = require('p-limit') // concurrency helper
const fs = require('fs/promises')
const path = require('path')
const WebScraper = require('./scripts/web-scraper')

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
  apiKey: process.env.PERPLEXITY_API_KEY || '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', // Fallback to key from logs if env missing
  baseURL: 'https://api.perplexity.ai'
})

class EnhancedEmbeddingGenerator {
  constructor() {
    this.batchSize = 10               // Reduced batch size for heavier processing
    this.concurrency = 10             // Reduced concurrency due to web scraping/GPT-4o
    this.delayMs = 0                  // no artificial pause needed
    this.maxRetries = 3               // retry attempts for transient errors
    this.retryBaseDelay = 1000         // base back‑off in ms
    this.limit = pLimit(this.concurrency)
    this.webScraper = new WebScraper()
    // Assume taxonomy file is in ../docs/taxonomy.md relative to this script (mv-intel-web)
    this.taxonomyPath = path.resolve(__dirname, '../docs/taxonomy.md')
    this.taxonomyContent = null
  }

  // ---------------------------------------------------------------------
  // Load taxonomy content once
  // ---------------------------------------------------------------------
  async loadTaxonomy() {
    if (!this.taxonomyContent) {
      try {
        this.taxonomyContent = await fs.readFile(this.taxonomyPath, 'utf-8')
      } catch (err) {
        console.error('Failed to load taxonomy file:', err)
        throw err
      }
    }
    return this.taxonomyContent
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
  // Fetch and cache webpage content
  // ---------------------------------------------------------------------
  async fetchWebpageContent(entity) {
    // If we have recent content (less than 30 days old), use it
    if (entity.webpage_content && entity.webpage_fetched_at) {
      const fetchedAt = new Date(entity.webpage_fetched_at)
      const daysOld = (new Date() - fetchedAt) / (1000 * 60 * 60 * 24)
      if (daysOld < 30) {
        return entity.webpage_content
      }
    }

    if (!entity.domain) return null

    let url = entity.domain
    if (!url.startsWith('http')) {
      url = `https://${url}`
    }

    try {
      const content = await this.webScraper.fetchPageContent(url)
      
      if (content) {
        // Cache in database immediately so we don't re-fetch on failure later in pipeline
        await pool.query(
          `UPDATE graph.entities SET webpage_content = $1, webpage_fetched_at = NOW() WHERE id = $2`,
          [content, entity.id]
        )
      }
      
      return content
    } catch (err) {
      console.warn(`Web scrape warning for ${entity.name}: ${err.message}`)
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Generate comprehensive business analysis 
  // Strategy:
  // 1. If we have web content -> Use GPT-5.1 to analyze it
  // 2. If NO web content -> Use Perplexity to search & analyze
  // ---------------------------------------------------------------------
  async generateBusinessAnalysis(entity, webpageContent) {
    try {
      // PATH A: We have scraped content (High Accuracy)
      if (webpageContent) {
        const prompt = `Analyze this company and provide a comprehensive business overview.

Company: ${entity.name}
Domain: ${entity.domain}
Existing Description: ${entity.description || 'None'}
Industry: ${entity.industry || 'Unknown'}

Website Content (excerpt):
${webpageContent.substring(0, 4000)}

Provide a structured analysis:
1. Core Business: What does the company do?
2. Products/Services: Main offerings
3. Target Market: Who are their customers?
4. Business Model: How do they make money?
5. Technology Stack: Key technologies used (inferred or explicit)
6. Industry Position: Market position and differentiators

Format as a valid JSON object with keys: "core_business", "products", "target_market", "business_model", "technology", "industry_position".
Important: "industry_position" must be an object with keys: "segment" (short string, e.g. "Insurtech") and "differentiators" (array of strings).`

        const response = await this.retry(async () => {
          return await openai.chat.completions.create({
            model: 'gpt-5.1',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3
          })
        })
        return JSON.parse(response.choices[0].message.content)
      } 
      
      // PATH B: Scraping failed -> Use Perplexity (Live Search)
      else {
        console.log(`Using Perplexity fallback for ${entity.name}...`)
        
        // Context Awareness: If domain missing, find associated people
        let context = ''
        if (!entity.domain) {
          try {
            const ppl = await pool.query(`
              SELECT t.name FROM graph.edges e 
              JOIN graph.entities t ON e.source = t.id
              WHERE e.target = $1 AND t.type = 'person' 
              LIMIT 3`, [entity.id])
            if (ppl.rows.length > 0) {
               context = ` (Associated People: ${ppl.rows.map(r => r.name).join(', ')})`
            }
          } catch (e) { /* ignore */ }
        }

        const prompt = `Research this company and provide a business analysis in JSON.

Company: ${entity.name}${context}
Domain: ${entity.domain}

Requirements:
1. Search for recent information about this company.
2. Return a valid JSON object with keys: "core_business", "products", "target_market", "business_model", "technology", "industry_position", "evidence_source".
3. "core_business" must be a detailed paragraph describing what they do.
4. "industry_position" must be an object with keys: "segment" (short string) and "differentiators" (array of strings).
5. "evidence_source" must be the URL or specific source text where you found this information. IF YOU CANNOT VERIFY THE COMPANY EXISTS, RETURN "error": "Company not found".`

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
          return JSON.parse(jsonMatch[0])
        }
        // If no JSON found (e.g. "I don't know"), throw to trigger fallback
        throw new Error('No JSON object found in Perplexity response')
      }

    } catch (err) {
      console.error(`Error generating business analysis for ${entity.name}:`, err.message)
      // Return a basic fallback if AI fails, to allow process to continue
      return {
        core_business: entity.description || "Unknown",
        products: "Unknown",
        target_market: "Unknown",
        business_model: "Unknown",
        technology: "Unknown",
        industry_position: "Unknown",
        error: err.message
      }
    }
  }

  // ---------------------------------------------------------------------
  // AI-driven taxonomy assignment
  // ---------------------------------------------------------------------
  async assignTaxonomy(entity, businessAnalysis) {
    try {
      const taxonomyRef = await this.loadTaxonomy()
      
      const prompt = `You are a fintech taxonomy expert. Assign the most accurate IFT taxonomy code(s) to this company.

Company: ${entity.name}

Business Analysis:
${JSON.stringify(businessAnalysis, null, 2)}

Reference Taxonomy (partial/structure):
${taxonomyRef.substring(0, 15000)}... (truncated for context window if needed, but usually fits)

INSTRUCTIONS:
1. Assign the PRIMARY taxonomy code (most specific match starting with IFT.)
2. Assign up to 3 SECONDARY codes if the company operates in multiple areas
3. Provide confidence score (0.0-1.0) for primary assignment
4. Explain your reasoning briefly

Return a valid JSON object with format:
{
  "primary": "IFT.XXX.YYY.ZZZ",
  "secondary": ["IFT.AAA.BBB", ...],
  "confidence": 0.95,
  "reasoning": "This company primarily operates in..."
}`

      const response = await this.retry(async () => {
        return await openai.chat.completions.create({
          model: 'gpt-5.1',
        messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      })

      return JSON.parse(response.choices[0].message.content)
    } catch (err) {
      console.error(`Error assigning taxonomy for ${entity.name}:`, err.message)
      return {
        primary: entity.taxonomy || 'IFT.UNKNOWN',
        secondary: [],
        confidence: 0.0,
        reasoning: `AI assignment failed: ${err.message}`
      }
    }
  }

  // ---------------------------------------------------------------------
  // Build the rich text representation of an entity (used for the main embedding)
  // ---------------------------------------------------------------------
  buildRichEntityText(entity, businessAnalysis, taxonomyAssignment) {
    let text = `Company: ${entity.name}\n`
    text += `Taxonomy: ${taxonomyAssignment.primary} (Confidence: ${taxonomyAssignment.confidence})\n`
    
    // Use the high-quality business analysis
    if (businessAnalysis) {
      text += `Core Business: ${businessAnalysis.core_business}\n`
      text += `Products: ${businessAnalysis.products}\n`
      text += `Target Market: ${businessAnalysis.target_market}\n`
      text += `Business Model: ${businessAnalysis.business_model}\n`
      text += `Technology: ${businessAnalysis.technology}\n`
    } else {
      // Fallback to existing fields
      text += `Type: ${entity.type}\n`
      if (entity.description) text += `Description: ${entity.description}\n`
      if (entity.industry) text += `Industry: ${entity.industry}\n`
    }
    
    if (entity.location_city) text += `Location: ${entity.location_city}`
    if (entity.location_country) text += `, ${entity.location_country}\n`
    if (entity.year_founded) text += `Founded: ${entity.year_founded}\n`
    
    // Keep secondary taxonomy in text
    if (taxonomyAssignment.secondary && taxonomyAssignment.secondary.length > 0) {
      text += `Related Categories: ${taxonomyAssignment.secondary.join(', ')}\n`
    }

    return text.trim()
  }

  // ---------------------------------------------------------------------
  // OpenAI embedding wrapper (with retry)
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
  // Process a single entity – main flow
  // ---------------------------------------------------------------------
  async processEntity(entity) {
    // 1. Fetch webpage (with cache)
    const webpageContent = await this.fetchWebpageContent(entity)
    
    // 2. Generate business analysis
    const businessAnalysis = await this.generateBusinessAnalysis(entity, webpageContent)
    
    // 3. Assign taxonomy
    const taxonomyAssignment = await this.assignTaxonomy(entity, businessAnalysis)
    
    // Determine enrichment source
    let enrichmentSource = 'web_scraper'
    if (!webpageContent) {
      if (businessAnalysis.error || businessAnalysis.core_business === (entity.description || "Unknown")) {
        enrichmentSource = 'gpt_fallback'
      } else {
        enrichmentSource = 'perplexity'
      }
    }

    // 4. Build rich text
    const richText = this.buildRichEntityText(entity, businessAnalysis, taxonomyAssignment)
    
    // 5. Generate embeddings
    const [richEmb, taxEmb] = await Promise.all([
      this.generateEmbedding(richText),
      this.generateEmbedding(taxonomyAssignment.primary || 'IFT.UNKNOWN')
    ])
    
    return { 
      id: entity.id, 
      richEmb, 
      taxEmb, 
      taxonomyAssignment, 
      businessAnalysis,
      enrichmentSource
    }
  }

  // ---------------------------------------------------------------------
  // DB update for all new fields
  // ---------------------------------------------------------------------
  async updateEntityData({ id, richEmb, taxEmb, taxonomyAssignment, businessAnalysis, enrichmentSource }) {
    return this.retry(async () => {
      const query = `
        UPDATE graph.entities 
        SET 
          embedding = $1, 
          taxonomy_embedding = $2,
          taxonomy = $3,
          taxonomy_secondary = $4,
          taxonomy_confidence = $5,
          taxonomy_reasoning = $6,
          business_analysis = $7,
          enrichment_source = $8
        WHERE id = $9
      `
      
      await pool.query(query, [
        JSON.stringify(richEmb), 
        JSON.stringify(taxEmb),
        taxonomyAssignment.primary,
        taxonomyAssignment.secondary,
        taxonomyAssignment.confidence,
        taxonomyAssignment.reasoning,
        businessAnalysis,
        enrichmentSource,
        id
      ])
    })
  }

  // ---------------------------------------------------------------------
  // Progress tracking table helper
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
  // Process a batch with concurrency control
  // ---------------------------------------------------------------------
  async processBatch(entities) {
    const tasks = entities.map(e => this.limit(async () => {
      try {
        const result = await this.processEntity(e)
        await this.updateEntityData(result)
        await this.recordStatus(e.id, 'completed', 1)
        console.log(`✅ Processed ${e.name} -> ${result.taxonomyAssignment.primary}`)
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
  async generateAllEnhancedEmbeddings({ incremental = false, limit = null, target = null } = {}) {
    console.log('Starting AI-driven taxonomy and embedding generation...')
    await this.loadTaxonomy()
    console.log('Taxonomy definition loaded.')

    // Build query
    let sql = `SELECT * FROM graph.entities WHERE type = 'organization'`
    
    if (target) {
        sql += ` AND name ILIKE '%${target}%'`
    } else if (incremental) {
      sql += ` AND business_analysis IS NULL`
    }
    
    if (limit) {
      sql += ` LIMIT ${limit}`
    }

    const { rows: entities } = await pool.query(sql)
    console.log(`Found ${entities.length} entities to process`)
    
    for (let i = 0; i < entities.length; i += this.batchSize) {
      const batch = entities.slice(i, i + this.batchSize)
      console.log(`Processing batch ${i / this.batchSize + 1}...`)
      await this.processBatch(batch)
      // Small pause between batches
      await new Promise(r => setTimeout(r, 1000))
    }
    console.log('Generation completed')
    await pool.end()
  }
}

// CLI entry point
async function main() {
  const generator = new EnhancedEmbeddingGenerator()
  const args = process.argv.slice(2)
  const incremental = args.includes('--incremental')
  
  // Check for limit argument (e.g. --limit 50)
  let limit = null
  const limitIndex = args.indexOf('--limit')
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10)
  }
  
  // Check for target argument (e.g. --target "Korr")
  let target = null
  const targetIndex = args.indexOf('--target')
  if (targetIndex !== -1 && args[targetIndex + 1]) {
    target = args[targetIndex + 1]
  }
  
  await generator.generateAllEnhancedEmbeddings({ incremental, limit, target })
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = EnhancedEmbeddingGenerator
