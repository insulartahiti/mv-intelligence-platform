// Load Env (Robustly)
const path = require('path')
// fs not needed for files unless loading something local, but path is used.

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

// Initialize Supabase Client (Bypass DNS/PG issues)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing!');
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

class EnhancedPersonEmbeddingGenerator {
  constructor() {
    this.batchSize = 10               // Reduced for stability
    this.concurrency = 5              // Reduced concurrency
    this.delayMs = 100                  
    this.maxRetries = 3               
    this.retryBaseDelay = 1000         
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
        // Try to find network context using Supabase
        try {
           const { data: edges } = await supabase
             .schema('graph')
             .from('edges')
             .select('target, kind')
             .eq('source', entity.id)
             .in('kind', ['works_at', 'founder', 'board_member', 'advisor', 'partner', 'deal_team', 'owner', 'invests_in'])
             .limit(5);

           if (edges && edges.length > 0) {
             const targetIds = edges.map(e => e.target);
             const { data: targets } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, name, domain, type')
                .eq('type', 'organization')
                .in('id', targetIds);
             
             if (targets && targets.length > 0) {
                 const orgs = targets.map(r => r.name).join(', ');
                 const domains = targets.filter(r => r.domain).map(r => r.domain).join(', ');
                 context = ` associated with organizations: ${orgs}`;
                 if (domains) context += ` (${domains})`;
                 
                 // Specific override for investors
                 if (edges.some(r => ['deal_team', 'owner', 'invests_in'].includes(r.kind))) {
                    context += ". Likely an Investor/VC or Private Equity professional.";
                 }
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
          model: 'llama-3.1-sonar-large-128k-online', // Updated model name for reliability
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        })
      })
      
      const content = response.choices[0].message.content
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return { data: JSON.parse(jsonMatch[0]), source: 'perplexity' }
      }
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
        if (e.title) profileText += `Current Title: ${e.title}\n`
        if (e.bio) profileText += `Bio: ${e.bio}\n`
        if (e.current_employer) profileText += `Employer: ${e.current_employer}\n`
        
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
          } catch (parseErr) {}
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
          model: 'gpt-4o',
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
        dimensions: 2000 // Using consistent dimensionality
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
      enrichmentSource,
      name: entity.name
    }
  }

  // ---------------------------------------------------------------------
  // DB update
  // ---------------------------------------------------------------------
  async updateEntityData({ id, richEmb, taxEmb, analysis, enrichmentSource }) {
    return this.retry(async () => {
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .update({
             embedding: richEmb,
             taxonomy_embedding: taxEmb,
             business_analysis: analysis,
             ai_summary: analysis.key_achievements, // Ensure legacy field is updated with fresh data
             taxonomy: 'PERSON',
             taxonomy_confidence: 1.0,
             enrichment_source: enrichmentSource
        })
        .eq('id', id)
      
      if (error) throw error
    })
  }

  // ---------------------------------------------------------------------
  // Progress tracking
  // ---------------------------------------------------------------------
  async recordStatus(id, status, attempts = 0, errorMsg = null) {
    try {
        await supabase
            .schema('graph')
            .from('embedding_status')
            .upsert({ 
                entity_id: id, 
                last_attempt: new Date().toISOString(), 
                status: status, 
                attempts: attempts, 
                error_message: errorMsg 
            }, { onConflict: 'entity_id' });
    } catch(e) {}
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
    console.log('Starting AI-driven Person Embedding generation (Supabase Mode)...')

    // Fetch IDs first to avoid timeouts with large datasets
    let query = supabase.schema('graph').from('entities').select('id').eq('type', 'person');
    
    if (incremental) {
       query = query.is('business_analysis', null);
    }
    
    if (limit) {
       query = query.limit(parseInt(limit));
    }
    
    // Pagination loop to fetch IDs
    console.log('Fetching candidate IDs...')
    let allIds = [];
    let page = 0;
    const pageSize = 1000;
    
    while(true) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error || !data || data.length === 0) break;
        allIds = allIds.concat(data.map(d => d.id));
        if (limit && allIds.length >= parseInt(limit)) break;
        page++;
        // Safety break
        if (page > 100) break;
    }
    
    if (limit) allIds = allIds.slice(0, parseInt(limit));

    console.log(`Found ${allIds.length} people to process`)
    
    for (let i = 0; i < allIds.length; i += this.batchSize) {
      const batchIds = allIds.slice(i, i + this.batchSize)
      
      // Fetch full details for this batch only
      const { data: batch, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .in('id', batchIds)
      
      if (error) {
          console.error('Error fetching batch details:', error);
          continue;
      }
      
      console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(allIds.length / this.batchSize)}...`)
      await this.processBatch(batch)
      // Small pause
      await new Promise(r => setTimeout(r, 500))
    }
    console.log('Person generation completed')
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