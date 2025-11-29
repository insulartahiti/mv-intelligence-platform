require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

async function testPerplexityIntegration() {
  console.log('🧪 Testing Perplexity Integration...\n');

  // Test Perplexity API directly
  try {
    console.log('🔍 Testing Perplexity API...');
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: 'What is Dwolla and what does Ben Milne do?'
          }
        ],
        max_tokens: 500,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Perplexity API error: ${response.status} - ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('✅ Perplexity API working!');
    console.log('Response:', data.choices[0].message.content.substring(0, 200) + '...');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing Perplexity:', error);
    return;
  }

  // Test GPT-4o analysis
  try {
    console.log('🤖 Testing GPT-4o analysis...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a fintech research analyst. Analyze entities and determine the most valuable web research areas for enhancement.'
        },
        {
          role: 'user',
          content: 'Analyze this entity: Ben Milne, person, fintech industry. Determine what web research would be most valuable.'
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    console.log('✅ GPT-4o analysis working!');
    console.log('Analysis:', JSON.stringify(analysis, null, 2));
    console.log('');

  } catch (error) {
    console.error('❌ Error testing GPT-4o:', error);
    return;
  }

  // Test the optimized system with a small batch
  console.log('🚀 Testing Optimized AI Enrichment System...');
  
  const { data: testEntity, error: entityError } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, type, industry, ai_summary, taxonomy, enrichment_data')
    .eq('name', 'Ben Milne')
    .limit(1);

  if (entityError || !testEntity || testEntity.length === 0) {
    console.error('Error fetching test entity:', entityError);
    return;
  }

  const entity = testEntity[0];
  console.log(`Testing with entity: ${entity.name} (${entity.type})`);

  // Test research needs analysis
  const researchPrompt = `Analyze this entity and determine what web research would be most valuable for enhancement.

Entity: ${entity.name}
Type: ${entity.type}
Industry: ${entity.industry || 'Not specified'}
Current AI Summary: ${entity.ai_summary || 'None'}

Based on the entity type and current information, determine which of these research areas would be most valuable:
1. "company_info" - Basic company information, business model, services
2. "market_intelligence" - Market position, competitors, trends
3. "recent_news" - Recent news, funding, partnerships, developments
4. "compliance_regulatory" - Regulatory compliance, certifications, licenses
5. "none" - No additional research needed

Respond with a JSON object:
{
  "research_needed": ["company_info", "market_intelligence"],
  "priority": "high|medium|low",
  "reasoning": "Why this research is valuable",
  "specific_queries": ["specific search queries for Perplexity"]
}`;

  try {
    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a fintech research analyst. Analyze entities and determine the most valuable web research areas for enhancement.'
        },
        {
          role: 'user',
          content: researchPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500
    });

    const researchNeeds = JSON.parse(analysisResponse.choices[0].message.content);
    console.log('✅ Research needs analysis working!');
    console.log('Research needs:', JSON.stringify(researchNeeds, null, 2));

    // Test web research if needed
    if (researchNeeds.research_needed.length > 0) {
      console.log('\n🌐 Testing web research...');
      
      for (const researchType of researchNeeds.research_needed.slice(0, 1)) { // Test only first research type
        const query = `${entity.name} ${entity.type} ${researchType} fintech`;
        console.log(`Query: ${query}`);
        
        const webResponse = await fetch(PERPLEXITY_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
              {
                role: 'user',
                content: query
              }
            ],
            max_tokens: 500,
            temperature: 0.2
          })
        });

        if (webResponse.ok) {
          const webData = await webResponse.json();
          console.log(`✅ Web research for ${researchType} working!`);
          console.log('Result:', webData.choices[0].message.content.substring(0, 200) + '...');
        } else {
          console.error(`❌ Web research failed for ${researchType}: ${webResponse.status}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

  } catch (error) {
    console.error('❌ Error in integrated test:', error);
  }

  console.log('\n🎉 Integration test completed!');
}

testPerplexityIntegration().catch(console.error);
