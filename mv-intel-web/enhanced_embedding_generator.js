// Load Env (Robustly)
const path = require('path')
// fs/promises imported below

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '.env.local'),
  path.resolve(__dirname, '../.env.local')
];

let envLoaded = false;
const fsSync = require('fs');
for (const p of envPaths) {
  if (fsSync.existsSync(p)) {
    require('dotenv').config({ path: p });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
    console.warn('⚠️ No .env.local found! Relying on process.env');
}

const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')
const pLimit = require('p-limit') // concurrency helper
const fsPromises = require('fs/promises')
const WebScraper = require('./scripts/web-scraper')

// Initialize Supabase Client (Bypass DNS/PG issues)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing! Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
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

class EnhancedEmbeddingGenerator {
  constructor() {
    this.batchSize = 5               // Reduced batch size for stability
    this.concurrency = 5             // Reduced concurrency to respect rate limits
    this.delayMs = 100                  
    this.maxRetries = 3               
    this.retryBaseDelay = 1000         
    this.limit = pLimit(this.concurrency)
    this.webScraper = new WebScraper()
    this.taxonomyPath = path.resolve(__dirname, '../docs/taxonomy.md')
    this.taxonomyContent = null
  }

  // ---------------------------------------------------------------------
  // Load taxonomy content once
  // ---------------------------------------------------------------------
  async loadTaxonomy() {
    if (!this.taxonomyContent) {
      try {
        this.taxonomyContent = await fsPromises.readFile(this.taxonomyPath, 'utf-8')
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
        // Cache in database immediately via Supabase
        await supabase
            .schema('graph')
            .from('entities')
            .update({ 
                webpage_content: content, 
                webpage_fetched_at: new Date().toISOString() 
            })
            .eq('id', entity.id);
      }
      
      return content
    } catch (err) {
      console.warn(`Web scrape warning for ${entity.name}: ${err.message}`)
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Generate comprehensive business analysis 
  // ---------------------------------------------------------------------
  async generateBusinessAnalysis(entity, webpageContent) {
    try {
      // PATH A: We have scraped content (High Accuracy)
      if (webpageContent) {
        const prompt = `Analyze this company and provide a comprehensive business overview.

Company: ${entity.name}
Domain: ${entity.domain}
Web Content: ${webpageContent.substring(0, 15000)}

Output ONLY valid JSON:
{
  "summary": "2-3 sentence overview of what they do, who they serve, and their value prop.",
  "core_business": "What is their main product/service?",
  "target_market": "Who are their customers?",
  "business_model": "SaaS, Marketplace, Hardware, etc.",
  "industry_tags": ["tag1", "tag2"],
  "technology": "Key tech stack inferred",
  "industry_position": { "segment": "Segment", "differentiators": ["diff1"] }
}`
        const completion = await openai.chat.completions.create({
          model: 'gpt-5.1',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
        return JSON.parse(completion.choices[0].message.content)
      }

      // PATH B: Perplexity Fallback
      const prompt = `Research this company: ${entity.name} (${entity.domain || 'unknown domain'}).
Provide a comprehensive business analysis.

Output ONLY valid JSON:
{
  "summary": "2-3 sentence overview.",
  "core_business": "Main product/service",
  "target_market": "Target customers",
  "business_model": "Business model type",
  "industry_tags": ["tag1", "tag2"],
  "technology": "Tech stack",
  "industry_position": { "segment": "Segment", "differentiators": ["diff1"] }
}`
      
      const completion = await perplexity.chat.completions.create({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }]
      })
      
      // Clean markdown if present
      const raw = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '')
      try {
          return JSON.parse(raw)
      } catch (e) {
          // Attempt fuzzy extraction
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
          throw e;
      }

    } catch (err) {
      console.error(`Analysis failed for ${entity.name}:`, err.message)
      return { 
        summary: entity.description || "Unknown", 
        core_business: "Unknown", 
        error: true 
      }
    }
  }

  // ---------------------------------------------------------------------
  // Assign taxonomy using GPT-5.1
  // ---------------------------------------------------------------------
  async assignTaxonomy(entity, analysis) {
    const taxonomy = await this.loadTaxonomy()
    
    try {
      const prompt = `Classify this company into the Investment Taxonomy.

Company: ${entity.name}
Analysis: ${JSON.stringify(analysis)}

Taxonomy Reference:
${taxonomy}

Output ONLY valid JSON:
{
  "primary": "CODE.SUBCODE",
  "secondary": ["CODE.SUBCODE"],
  "confidence": 0.95,
  "reasoning": "Why this classification fits best"
}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-5.1', // Use 5.1 for classification accuracy
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })

      return JSON.parse(completion.choices[0].message.content)
    } catch (err) {
      return { primary: 'IFT.UNKNOWN', secondary: [], confidence: 0, reasoning: 'Failed to classify' }
    }
  }

  // ---------------------------------------------------------------------
  // Generate text embedding (2000d) - Matching Database Schema
  // ---------------------------------------------------------------------
  async generateEmbedding(text) {
    if (!text) return null
    try {
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text.substring(0, 8000),
        dimensions: 2000
      })
      return resp.data[0].embedding
    } catch (err) {
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Build rich text for embedding
  // ---------------------------------------------------------------------
  buildRichEntityText(entity, analysis, taxonomy) {
    return `
Company: ${entity.name}
Industry: ${analysis.industry_tags?.join(', ') || entity.industry}
Sector: ${taxonomy.primary} (${taxonomy.secondary?.join(', ')})
Business Model: ${analysis.business_model}
Target Market: ${analysis.target_market}
Core Business: ${analysis.core_business}
Summary: ${analysis.summary}
    `.trim()
  }

  // ---------------------------------------------------------------------
  // Process Single Entity
  // ---------------------------------------------------------------------
  async processEntity(entity) {
    // 1. Fetch content (Web -> Cache)
    const webpageContent = await this.fetchWebpageContent(entity)
    
    // 2. Analyze (GPT-4o or Perplexity)
    const businessAnalysis = await this.generateBusinessAnalysis(entity, webpageContent)
    
    // 3. Classify (Taxonomy)
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
      enrichmentSource,
      name: entity.name
    }
  }

  // ---------------------------------------------------------------------
  // DB update for all new fields
  // ---------------------------------------------------------------------
  async updateEntityData({ id, richEmb, taxEmb, taxonomyAssignment, businessAnalysis, enrichmentSource }) {
    return this.retry(async () => {
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .update({
          embedding: richEmb,
          taxonomy_embedding: taxEmb,
          taxonomy: taxonomyAssignment.primary,
          taxonomy_secondary: taxonomyAssignment.secondary,
          taxonomy_confidence: taxonomyAssignment.confidence,
          taxonomy_reasoning: taxonomyAssignment.reasoning,
          business_analysis: businessAnalysis,
          ai_summary: businessAnalysis.summary || businessAnalysis.core_business, // Ensure legacy field is updated with fresh data
          enrichment_source: enrichmentSource,
          enriched: true,
          last_enriched_at: new Date().toISOString()
        })
        .eq('id', id)
      
      if (error) throw error;
    })
  }

  // ---------------------------------------------------------------------
  // Progress tracking table helper
  // ---------------------------------------------------------------------
  async recordStatus(id, status, attempts = 0, errorMsg = null) {
    try {
        // embedding_status might not be in 'graph' schema? Usually public or graph.
        // Assuming public based on previous code usage, but let's check schema.
        // Actually, previous code used `INSERT INTO embedding_status`. If search path was public, then public.
        // I'll try 'graph' schema first, then fallback or just assume public if fails.
        // To be safe, I'll try without schema specifier (which defaults to public) or check.
        // Given 'graph.entities', likely 'graph.embedding_status' exists?
        // Checking migration files... usually everything is in graph schema.
        
        await supabase
            .schema('graph') // Explicit schema
            .from('embedding_status')
            .upsert({ 
                entity_id: id, 
                last_attempt: new Date().toISOString(), 
                status: status, 
                attempts: attempts, 
                error_message: errorMsg 
            }, { onConflict: 'entity_id' });
    } catch (e) {
        // Ignore status update errors to keep pipeline running
        // console.error('Status update failed:', e);
    }
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
    console.log('Starting AI-driven taxonomy and embedding generation (Supabase Mode)...')
    await this.loadTaxonomy()
    console.log('Taxonomy definition loaded.')

    // Build query
    let query = supabase.schema('graph').from('entities').select('*').eq('type', 'organization')
    
    if (target) {
        query = query.ilike('name', `%${target}%`)
    } else if (incremental) {
        query = query.is('business_analysis', null)
    }
    
    if (limit) {
        query = query.limit(parseInt(limit))
    }

    // Since we can't easily iterate a cursor with supabase-js without complex pagination logic for huge datasets,
    // we'll implement a simple pagination loop here assuming standard usage.
    
    console.log('Fetching entities...')
    let allEntities = []
    let page = 0;
    const pageSize = 1000;
    
    while(true) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error('Fetch error:', error);
            break;
        }
        if (!data || data.length === 0) break;
        allEntities = allEntities.concat(data);
        if (limit && allEntities.length >= parseInt(limit)) break;
        page++;
        // Safety break
        if (page > 100) break; 
    }
    
    if (limit) allEntities = allEntities.slice(0, parseInt(limit));

    console.log(`Found ${allEntities.length} entities to process`)
    
    for (let i = 0; i < allEntities.length; i += this.batchSize) {
      const batch = allEntities.slice(i, i + this.batchSize)
      console.log(`Processing batch ${i / this.batchSize + 1}...`)
      await this.processBatch(batch)
      // Small pause between batches
      await new Promise(r => setTimeout(r, 1000))
    }
    console.log('Generation completed')
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
    limit = args[limitIndex + 1]
  }

  // Check for target argument
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