require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Taxonomy mapping for enhanced context
const TAXONOMY_MAPPING = {
  // KYB & Compliance
  'KYB': ['IFT.RCI.ID.KYB.BASIC_PROFILE', 'IFT.RCI.ID.KYB.UBO_DISCOVERY', 'IFT.RCI.ID.KYB.DOC_COLLECTION'],
  'KYC': ['IFT.RCI.ID.KYC'],
  'AML': ['IFT.RCI.REG.TMON.REALTIME', 'IFT.RCI.REG.TMON.CASE_MGMT'],
  'RegTech': ['IFT.RCI.REG.PROFILE_DD', 'IFT.RCI.REG.BLOCKCHAIN_FORENSICS', 'IFT.RCI.REG.RISK_ANALYTICS'],
  'Compliance': ['IFT.RCI.REG.DYNAMIC_COMPLIANCE', 'IFT.RCI.REG.REPORTING', 'IFT.RCI.REG.REPORTING_DASHBOARDS'],

  // Payments
  'Payments': ['IFT.PAY.COM.GATEWAY', 'IFT.PAY.COM.AGGREGATOR', 'IFT.PAY.INF.CLEARING'],
  'Payment Gateway': ['IFT.PAY.COM.GATEWAY'],
  'PSP': ['IFT.PAY.COM.GATEWAY', 'IFT.PAY.COM.AGGREGATOR'],

  // Banking
  'Banking': ['IFT.DBK.RETAIL.NEO_BANK', 'IFT.DBK.MSME.NEO_BANK', 'IFT.DBK.BAAS'],
  'Neo Bank': ['IFT.DBK.RETAIL.NEO_BANK', 'IFT.DBK.MSME.NEO_BANK'],
  'BaaS': ['IFT.DBK.BAAS'],

  // Lending
  'Lending': ['IFT.LEN.BSL.BUSINESS', 'IFT.LEN.BSL.CONSUMER', 'IFT.LEN.P2P.BUSINESS'],
  'Business Lending': ['IFT.LEN.BSL.BUSINESS', 'IFT.LEN.P2P.BUSINESS'],
  'Consumer Lending': ['IFT.LEN.BSL.CONSUMER', 'IFT.LEN.P2P.CONSUMER'],

  // Wealth Management
  'Wealth Management': ['IFT.WLT.FO.CRM', 'IFT.WLT.FO.INVEST', 'IFT.WLT.MO.COMPLIANCE'],
  'Asset Management': ['IFT.WLT.BO.PMS', 'IFT.WLT.BO.PLANNING'],

  // Crypto
  'Crypto': ['IFT.CRYP.EXCH.TRADE.ORDERBOOK', 'IFT.CRYP.CUST.INST.THIRD_PARTY', 'IFT.CRYP.STBL.ISSUER.FIAT_BACKED'],
  'Trading': ['IFT.CRYP.EXCH.TRADE.ORDERBOOK', 'IFT.CRYP.EXCH.TRADE.DEX_RELAYER'],
  'Custody': ['IFT.CRYP.CUST.INST.THIRD_PARTY', 'IFT.CRYP.CUST.RET.HARD_WALLET'],

  // Insurance
  'Insurance': ['IFT.INS.USAGE_BASED', 'IFT.INS.PARAMETRIC', 'IFT.INS.ON_DEMAND'],
  'InsurTech': ['IFT.INS.USAGE_BASED', 'IFT.INS.PARAMETRIC', 'IFT.INS.ON_DEMAND']
};

class TaxonomyEnhancedEmbeddingGenerator {
  constructor() {
    this.processedCount = 0;
    this.batchSize = 10;
    this.delay = 2000; // 2 seconds between batches
  }

  async buildEnhancedEntityText(entity) {
    const parts = [];

    // 1. Basic entity information
    parts.push(`Entity: ${entity.name}`);
    if (entity.type) parts.push(`Type: ${entity.type}`);
    if (entity.industry) parts.push(`Industry: ${entity.industry}`);

    // 2. Business context from existing data
    if (entity.ai_summary) {
      parts.push(`Business Summary: ${entity.ai_summary}`);
    }

    // 3. Taxonomy classification
    if (entity.taxonomy) {
      const taxonomyCodes = Array.isArray(entity.taxonomy) ? entity.taxonomy : [entity.taxonomy];
      parts.push(`Taxonomy Classification: ${taxonomyCodes.join(', ')}`);

      // Add semantic context for each taxonomy code
      for (const code of taxonomyCodes) {
        const semanticContext = this.getTaxonomySemanticContext(code);
        if (semanticContext) {
          parts.push(`Semantic Context: ${semanticContext}`);
        }
      }
    }

    // 4. Enrichment data context
    if (entity.enrichment_data) {
      const enrichment = entity.enrichment_data;

      if (enrichment.parsed_web_data) {
        const webData = enrichment.parsed_web_data;
        if (webData.business_model) parts.push(`Business Model: ${webData.business_model}`);
        if (webData.technology_stack) parts.push(`Technology Stack: ${webData.technology_stack}`);
        if (webData.use_cases) parts.push(`Use Cases: ${webData.use_cases}`);
        if (webData.target_market) parts.push(`Target Market: ${webData.target_market}`);
      }

      if (enrichment.perplexity_data) {
        const perplexity = enrichment.perplexity_data;
        if (perplexity.company_description) parts.push(`Company Description: ${perplexity.company_description}`);
        if (perplexity.key_products) parts.push(`Key Products: ${perplexity.key_products}`);
        if (perplexity.technology_focus) parts.push(`Technology Focus: ${perplexity.technology_focus}`);
      }
    }

    // 5. Areas of expertise
    if (entity.areas_of_expertise && entity.areas_of_expertise.length > 0) {
      parts.push(`Areas of Expertise: ${entity.areas_of_expertise.join(', ')}`);
    }

    // 6. Compliance and regulatory context
    const complianceContext = this.buildComplianceContext(entity);
    if (complianceContext) {
      parts.push(`Compliance & Regulatory Context: ${complianceContext}`);
    }

    // 7. Business relationships and network context
    if (entity.is_portfolio) parts.push(`Portfolio Company`);
    if (entity.is_pipeline) parts.push(`Pipeline Company`);
    if (entity.is_internal) parts.push(`Internal Entity`);

    return parts.join('\n\n');
  }

  getTaxonomySemanticContext(taxonomyCode) {
    // Map taxonomy codes to semantic descriptions
    const semanticMap = {
      'IFT.RCI.ID.KYB.BASIC_PROFILE': 'Know Your Business (KYB) - Basic company profile verification and entity identification services',
      'IFT.RCI.ID.KYC': 'Know Your Customer (KYC) - Customer identity verification and onboarding services',
      'IFT.RCI.REG.TMON.REALTIME': 'Anti-Money Laundering (AML) - Real-time transaction monitoring and suspicious activity detection',
      'IFT.RCI.REG.DYNAMIC_COMPLIANCE': 'Regulatory Technology (RegTech) - Dynamic compliance management and regulatory reporting',
      'IFT.PAY.COM.GATEWAY': 'Payment Gateway - Payment processing infrastructure and transaction routing services',
      'IFT.PAY.COM.AGGREGATOR': 'Payment Aggregator - Multi-merchant payment processing and unified payment solutions',
      'IFT.DBK.RETAIL.NEO_BANK': 'Digital Retail Banking - Consumer-focused digital banking services and mobile banking platforms',
      'IFT.DBK.BAAS': 'Banking as a Service (BaaS) - Embedded banking infrastructure and API-based financial services',
      'IFT.LEN.BSL.BUSINESS': 'Business Lending - Commercial credit products and business financing solutions',
      'IFT.WLT.FO.INVEST': 'Wealth Management - Investment advisory and portfolio management services',
      'IFT.CRYP.EXCH.TRADE.ORDERBOOK': 'Cryptocurrency Exchange - Digital asset trading platform and exchange services',
      'IFT.CRYP.CUST.INST.THIRD_PARTY': 'Digital Asset Custody - Institutional cryptocurrency custody and security services'
    };

    return semanticMap[taxonomyCode] || null;
  }

  buildComplianceContext(entity) {
    const complianceElements = [];

    // Check for compliance-related taxonomy
    if (entity.taxonomy) {
      const taxonomyCodes = Array.isArray(entity.taxonomy) ? entity.taxonomy : [entity.taxonomy];

      if (taxonomyCodes.some(code => code.includes('KYB') || code.includes('KYC'))) {
        complianceElements.push('Identity Verification & Customer Onboarding');
      }

      if (taxonomyCodes.some(code => code.includes('AML') || code.includes('TMON'))) {
        complianceElements.push('Anti-Money Laundering & Transaction Monitoring');
      }

      if (taxonomyCodes.some(code => code.includes('REG') || code.includes('COMPLIANCE'))) {
        complianceElements.push('Regulatory Technology & Compliance Management');
      }

      if (taxonomyCodes.some(code => code.includes('SANCTIONS'))) {
        complianceElements.push('Sanctions Screening & Risk Assessment');
      }
    }

    // Check for compliance-related keywords in AI summary
    if (entity.ai_summary) {
      const summary = entity.ai_summary.toLowerCase();
      if (summary.includes('compliance') || summary.includes('regulatory')) {
        complianceElements.push('Regulatory Compliance Services');
      }
      if (summary.includes('kyb') || summary.includes('kyc')) {
        complianceElements.push('Identity & Business Verification');
      }
      if (summary.includes('aml') || summary.includes('anti-money laundering')) {
        complianceElements.push('AML & Financial Crime Prevention');
      }
    }

    return complianceElements.length > 0 ? complianceElements.join('; ') : null;
  }

  async generateEnhancedEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 2000, // Supabase pgvector limit
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  async processEntityBatch(entities) {
    const promises = entities.map(async (entity) => {
      try {
        // Build enhanced text with taxonomy context
        const enhancedText = await this.buildEnhancedEntityText(entity);

        // Generate embedding
        const embedding = await this.generateEnhancedEmbedding(enhancedText);

        if (embedding) {
          // Update entity with enhanced embedding
          const { error } = await supabase
            .schema('graph')
            .from('entities')
            .update({
              embedding: embedding,
              ai_summary: entity.ai_summary || 'Enhanced with taxonomy context',
              taxonomy: entity.taxonomy || this.inferTaxonomyFromContext(entity)
            })
            .eq('id', entity.id);

          if (error) {
            console.error(`Error updating entity ${entity.id}:`, error);
          } else {
            console.log(`✅ Enhanced entity: ${entity.name}`);
          }
        }

        return { success: true, entityId: entity.id };
      } catch (error) {
        console.error(`Error processing entity ${entity.id}:`, error);
        return { success: false, entityId: entity.id, error };
      }
    });

    return Promise.all(promises);
  }

  inferTaxonomyFromContext(entity) {
    // Infer taxonomy from existing data when not explicitly set
    const context = [
      entity.name,
      entity.industry,
      entity.ai_summary,
      entity.areas_of_expertise?.join(' ') || ''
    ].join(' ').toLowerCase();

    const inferredTaxonomy = [];

    // Check for compliance-related terms
    if (context.includes('kyb') || context.includes('know your business')) {
      inferredTaxonomy.push('IFT.RCI.ID.KYB.BASIC_PROFILE');
    }

    if (context.includes('kyc') || context.includes('know your customer')) {
      inferredTaxonomy.push('IFT.RCI.ID.KYC');
    }

    if (context.includes('aml') || context.includes('anti-money laundering')) {
      inferredTaxonomy.push('IFT.RCI.REG.TMON.REALTIME');
    }

    if (context.includes('compliance') || context.includes('regtech')) {
      inferredTaxonomy.push('IFT.RCI.REG.DYNAMIC_COMPLIANCE');
    }

    // Check for payment-related terms
    if (context.includes('payment') || context.includes('gateway') || context.includes('psp')) {
      inferredTaxonomy.push('IFT.PAY.COM.GATEWAY');
    }

    // Check for banking terms
    if (context.includes('bank') || context.includes('banking') || context.includes('neobank')) {
      inferredTaxonomy.push('IFT.DBK.RETAIL.NEO_BANK');
    }

    // Check for lending terms
    if (context.includes('lending') || context.includes('loan') || context.includes('credit')) {
      inferredTaxonomy.push('IFT.LEN.BSL.BUSINESS');
    }

    return inferredTaxonomy.length > 0 ? inferredTaxonomy : null;
  }

  async run() {
    console.log('🚀 Starting Taxonomy-Enhanced Embedding Generation...');
    let hasMore = true;
    let totalProcessed = 0;

    while (hasMore) {
      try {
        // Get entities that need enhancement (no embedding)
        // We prioritize entities without embeddings
        const { data: entities, error } = await supabase
          .schema('graph')
          .from('entities')
          .select('*')
          .is('embedding', null)
          .limit(100); // Process 100 at a time to keep memory low

        if (error) {
          console.error('Error fetching entities:', error);
          return;
        }

        if (!entities || entities.length === 0) {
          console.log('✅ No more entities to process.');
          hasMore = false;
          break;
        }

        console.log(`📊 Found ${entities.length} entities to enhance in this batch`);

        // Process entities in sub-batches
        for (let i = 0; i < entities.length; i += this.batchSize) {
          const batch = entities.slice(i, i + this.batchSize);
          // console.log(`\n🔄 Processing sub-batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(entities.length / this.batchSize)}`);

          await this.processEntityBatch(batch);
          this.processedCount += batch.length;
          totalProcessed += batch.length;

          console.log(`✅ Processed ${totalProcessed} entities total (Current batch: ${i + batch.length}/${entities.length})`);

          // Delay between batches to avoid rate limiting
          if (i + this.batchSize < entities.length) {
            await new Promise(resolve => setTimeout(resolve, this.delay));
          }
        }

        // Small pause between large fetches
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error('❌ Error in embedding generation:', error);
        // Wait a bit before retrying on error
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('\n🎉 Taxonomy-Enhanced Embedding Generation Complete!');
    console.log(`📈 Total entities processed: ${totalProcessed}`);
  }
}

// Run the enhanced generator
const generator = new TaxonomyEnhancedEmbeddingGenerator();
generator.run();
