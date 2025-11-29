#!/usr/bin/env node

/**
 * Test Perplexity API directly
 */

require('dotenv').config({ path: '.env' });

async function testPerplexityAPI() {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityApiKey) {
    console.error('❌ PERPLEXITY_API_KEY not found in environment');
    return;
  }
  
  console.log('🧪 Testing Perplexity API directly...\n');
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a professional research assistant. Search the web for information about the given person and return structured data about their professional background, current role, expertise, and recent activities. Focus on factual, verifiable information.'
          },
          {
            role: 'user',
            content: 'Find detailed professional information about Blythe Masters. Include their current employer, job title, industry, expertise areas, career background, recent publications, speaking engagements, and any notable achievements. Focus on factual, verifiable information from reliable sources.'
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ API Response received`);
    console.log(`📊 Model: ${data.model}`);
    console.log(`📊 Usage:`, data.usage);
    
    const content = data.choices[0]?.message?.content || '';
    console.log(`📝 Content length: ${content.length} characters`);
    console.log(`📝 Content preview: ${content.substring(0, 300)}...`);
    
    if (content.length > 0) {
      console.log(`✅ Perplexity API is working correctly!`);
    } else {
      console.log(`⚠️  Perplexity API returned empty content`);
    }
    
  } catch (error) {
    console.error('❌ Error testing Perplexity API:', error.message);
  }
}

testPerplexityAPI();
