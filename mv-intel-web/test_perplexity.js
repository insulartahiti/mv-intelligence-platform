require('dotenv').config({ path: '.env.local' })
const OpenAI = require('openai')

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY || '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',
  baseURL: 'https://api.perplexity.ai'
})

const models = [
  'llama-3.1-sonar-small-128k-online',
  'llama-3.1-sonar-large-128k-online',
  'llama-3.1-sonar-huge-128k-online',
  'llama-3-sonar-small-32k-online',
  'llama-3-sonar-large-32k-online',
  'sonar',
  'sonar-pro'
]

async function testModel(model) {
  try {
    console.log(`Testing ${model}...`)
    const response = await perplexity.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: 'Return a JSON object with key "status" and value "ok".' }],
      temperature: 0.1
    })
    console.log(`✅ ${model} SUCCESS`)
    console.log(response.choices[0].message.content)
    return true
  } catch (error) {
    console.log(`❌ ${model} FAILED: ${error.message}`)
    if (error.response) {
       console.log(JSON.stringify(error.response.data))
    }
    return false
  }
}

async function run() {
  console.log('Testing Perplexity Models...')
  for (const model of models) {
    const success = await testModel(model)
    if (success) break // Stop after first success
  }
}

run()
