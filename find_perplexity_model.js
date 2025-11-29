require('dotenv').config({ path: '.env' });

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// Common Perplexity model names to try
const modelsToTry = [
  'sonar-small-chat',
  'sonar-medium-chat',
  'sonar-small-online',
  'sonar-medium-online',
  'sonar',
  'llama-3.1-sonar-small-128k-online',
  'llama-3.1-sonar-large-128k-online',
  'mistral-7b-instruct'
];

async function findWorkingModel() {
  console.log('🔍 Testing Perplexity API models...\n');

  for (const model of modelsToTry) {
    try {
      console.log(`Testing: ${model}`);
      
      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 50
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ SUCCESS: ${model} works!`);
        console.log(`   Response: ${data.choices[0].message.content.substring(0, 100)}\n`);
        return model;
      } else {
        const error = await response.text();
        console.log(`❌ Failed: ${response.status}\n`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
  
  console.log('❌ No working model found. Please check Perplexity documentation.');
}

findWorkingModel();
