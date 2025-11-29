require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testAIEnhancement() {
  console.log('🤖 Testing AI Enhancement with GPT-4o...\n');
  
  // Get a sample entity that needs enhancement
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('*')
    .or('ai_summary.is.null,taxonomy.is.null')
    .not('name', 'ilike', '%(%)%')
    .limit(1);
    
  if (!entities || entities.length === 0) {
    console.log('No entities found for testing');
    return;
  }
  
  const entity = entities[0];
  console.log(`📊 Testing with: ${entity.name}`);
  console.log(`   Type: ${entity.type}`);
  console.log(`   Industry: ${entity.industry}`);
  console.log(`   Current AI Summary: ${entity.ai_summary || 'None'}`);
  console.log(`   Current Taxonomy: ${entity.taxonomy || 'None'}\n`);
  
  // Build enhanced prompt
  const prompt = buildEnrichmentPrompt(entity);
  console.log('📝 Enhanced Prompt:');
  console.log(prompt.substring(0, 500) + '...\n');
  
  try {
    // Generate enhanced AI summary with GPT-4o
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a fintech industry expert specializing in company analysis and taxonomy classification. 
          Your task is to analyze companies and provide comprehensive business summaries with accurate taxonomy classification.
          
          Use the Integrated Fintech Taxonomy (IFT) structure:
          - IFT.PAY.* for payments and money movement
          - IFT.LEN.* for lending and credit
          - IFT.DBK.* for digital banking
          - IFT.WLT.* for wealth and asset management
          - IFT.CRYP.* for crypto and digital assets
          - IFT.RCI.* for risk, compliance, and identity
          - IFT.INS.* for insurance technology
          - IFT.OPS.* for finance operations and treasury
          
          Focus on:
          1. Business model and value proposition
          2. Technology stack and capabilities
          3. Target market and use cases
          4. Regulatory and compliance aspects
          5. Competitive positioning
          6. Accurate taxonomy classification`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });
    
    const aiResponse = response.choices[0].message.content;
    console.log('🤖 GPT-4o Response:');
    console.log(aiResponse);
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Parse the response
    const parsed = parseAIResponse(aiResponse);
    console.log('📋 Parsed Results:');
    console.log(`   Summary: ${parsed.ai_summary || 'None'}`);
    console.log(`   Taxonomy: ${JSON.stringify(parsed.taxonomy) || 'None'}`);
    console.log(`   Capabilities: ${parsed.capabilities || 'None'}`);
    console.log(`   Market: ${parsed.market || 'None'}`);
    console.log(`   Compliance: ${parsed.compliance || 'None'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function buildEnrichmentPrompt(entity) {
  const parts = [];
  
  parts.push(`Analyze this fintech company and provide a comprehensive business summary with taxonomy classification:`);
  parts.push(`\nCompany: ${entity.name}`);
  
  if (entity.type) parts.push(`Type: ${entity.type}`);
  if (entity.industry) parts.push(`Industry: ${entity.industry}`);
  
  // Include existing data for context
  if (entity.ai_summary) {
    parts.push(`\nCurrent Summary: ${entity.ai_summary}`);
  }
  
  if (entity.enrichment_data) {
    const enrichment = entity.enrichment_data;
    
    if (enrichment.parsed_web_data) {
      const webData = enrichment.parsed_web_data;
      if (webData.business_model) parts.push(`Business Model: ${webData.business_model}`);
      if (webData.technology_stack) parts.push(`Technology: ${webData.technology_stack}`);
      if (webData.use_cases) parts.push(`Use Cases: ${webData.use_cases}`);
    }
    
    if (enrichment.perplexity_data) {
      const perplexity = enrichment.perplexity_data;
      if (perplexity.company_description) parts.push(`Description: ${perplexity.company_description}`);
      if (perplexity.key_products) parts.push(`Products: ${perplexity.key_products}`);
    }
  }
  
  if (entity.areas_of_expertise && entity.areas_of_expertise.length > 0) {
    parts.push(`Areas of Expertise: ${entity.areas_of_expertise.join(', ')}`);
  }
  
  parts.push(`\nPlease provide:
    1. A comprehensive business summary (2-3 sentences)
    2. Primary taxonomy classification using IFT codes
    3. Secondary taxonomy classifications if applicable
    4. Key business capabilities and value proposition
    5. Target market and use cases
    6. Regulatory/compliance aspects if relevant
    
    Format your response as:
    SUMMARY: [business summary]
    TAXONOMY: [primary IFT code, secondary codes if any]
    CAPABILITIES: [key capabilities]
    MARKET: [target market and use cases]
    COMPLIANCE: [regulatory aspects if relevant]`);
  
  return parts.join('\n');
}

function parseAIResponse(response) {
  const result = {
    ai_summary: null,
    taxonomy: null,
    capabilities: null,
    market: null,
    compliance: null
  };
  
  if (!response) return result;
  
  // Extract summary
  const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=\n[A-Z]+:|$)/s);
  if (summaryMatch) {
    result.ai_summary = summaryMatch[1].trim();
  }
  
  // Extract taxonomy
  const taxonomyMatch = response.match(/TAXONOMY:\s*(.+?)(?=\n[A-Z]+:|$)/s);
  if (taxonomyMatch) {
    const taxonomyText = taxonomyMatch[1].trim();
    // Parse IFT codes from the response
    const iftCodes = taxonomyText.match(/IFT\.[A-Z0-9_.]+/g);
    if (iftCodes) {
      result.taxonomy = iftCodes;
    }
  }
  
  // Extract capabilities
  const capabilitiesMatch = response.match(/CAPABILITIES:\s*(.+?)(?=\n[A-Z]+:|$)/s);
  if (capabilitiesMatch) {
    result.capabilities = capabilitiesMatch[1].trim();
  }
  
  // Extract market
  const marketMatch = response.match(/MARKET:\s*(.+?)(?=\n[A-Z]+:|$)/s);
  if (marketMatch) {
    result.market = marketMatch[1].trim();
  }
  
  // Extract compliance
  const complianceMatch = response.match(/COMPLIANCE:\s*(.+?)(?=\n[A-Z]+:|$)/s);
  if (complianceMatch) {
    result.compliance = complianceMatch[1].trim();
  }
  
  return result;
}

testAIEnhancement().catch(console.error);
