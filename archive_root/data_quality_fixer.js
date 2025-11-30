require('dotenv').config({ path: 'mv-intel-web/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

class DataQualityFixer {
  constructor() {
    this.batchSize = 100
  }

  // Fix malformed person names
  async fixMalformedNames() {
    try {
      console.log('🔧 Fixing malformed person names...')
      
      // Get entities with malformed names
      const { data: malformedEntities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type')
        .eq('type', 'person')
        .or('name.ilike.%(%', 'name.ilike.%CEO%', 'name.ilike.%CTO%', 'name.ilike.%Founder%')
        .limit(1000) // Process in batches
      
      if (error) {
        console.error('❌ Error fetching malformed entities:', error)
        return
      }
      
      console.log(`Found ${malformedEntities.length} malformed person entities`)
      
      const updates = []
      
      for (const entity of malformedEntities) {
        const fixedName = this.extractPersonName(entity.name)
        if (fixedName && fixedName !== entity.name) {
          updates.push({
            id: entity.id,
            name: fixedName,
            original_name: entity.name
          })
        }
      }
      
      console.log(`Will update ${updates.length} entities`)
      
      // Update in batches
      for (let i = 0; i < updates.length; i += this.batchSize) {
        const batch = updates.slice(i, i + this.batchSize)
        
        for (const update of batch) {
          const { error: updateError } = await supabase
            .schema('graph')
            .from('entities')
            .update({ name: update.name })
            .eq('id', update.id)
          
          if (updateError) {
            console.error(`❌ Error updating ${update.id}:`, updateError)
          } else {
            console.log(`✅ Fixed: "${update.original_name}" → "${update.name}"`)
          }
        }
        
        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      console.log('✅ Malformed names fixed!')
      
    } catch (err) {
      console.error('❌ Error fixing malformed names:', err)
    }
  }

  // Extract person name from malformed string
  extractPersonName(malformedName) {
    // Patterns to extract names
    const patterns = [
      // "John Doe (CEO" → "John Doe"
      /^([^(]+)\s*\(/,
      // "John Doe (Co Founder" → "John Doe"  
      /^([^(]+)\s*\(/,
      // "John Doe (CTO" → "John Doe"
      /^([^(]+)\s*\(/,
      // "John Doe (Founder" → "John Doe"
      /^([^(]+)\s*\(/,
      // "John Doe (Chief Product Officer" → "John Doe"
      /^([^(]+)\s*\(/,
    ]
    
    for (const pattern of patterns) {
      const match = malformedName.match(pattern)
      if (match && match[1]) {
        const name = match[1].trim()
        // Validate it looks like a real name
        if (name.length > 2 && name.length < 50 && /^[a-zA-Z\s\.\-']+$/.test(name)) {
          return name
        }
      }
    }
    
    return null
  }

  // Clean up duplicate or low-quality entities
  async cleanupLowQualityEntities() {
    try {
      console.log('🧹 Cleaning up low-quality entities...')
      
      // Find entities with very short names or just job titles
      const { data: lowQualityEntities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type')
        .or('name.ilike.%CEO%', 'name.ilike.%CTO%', 'name.ilike.%Founder%')
        .limit(500)
      
      if (error) {
        console.error('❌ Error fetching low-quality entities:', error)
        return
      }
      
      console.log(`Found ${lowQualityEntities.length} low-quality entities`)
      
      // Mark for deletion (don't actually delete yet)
      const toDelete = lowQualityEntities.filter(entity => {
        const name = entity.name.toLowerCase()
        return name.includes('ceo') || name.includes('cto') || 
               name.includes('founder') || name.includes('co-founder')
      })
      
      console.log(`Would delete ${toDelete.length} low-quality entities`)
      
      // For now, just log them
      toDelete.slice(0, 10).forEach(entity => {
        console.log(`- "${entity.name}" (${entity.type})`)
      })
      
    } catch (err) {
      console.error('❌ Error cleaning up entities:', err)
    }
  }

  // Generate better AI summaries for entities
  async improveAISummaries() {
    try {
      console.log('🤖 Improving AI summaries...')
      
      // Get entities with poor AI summaries
      const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, industry, ai_summary')
        .or('ai_summary.is.null', 'ai_summary.ilike.%is a AI company%')
        .limit(100)
      
      if (error) {
        console.error('❌ Error fetching entities:', error)
        return
      }
      
      console.log(`Found ${entities.length} entities with poor AI summaries`)
      
      // This would require OpenAI integration
      console.log('📝 AI summary improvement would require OpenAI integration')
      
    } catch (err) {
      console.error('❌ Error improving AI summaries:', err)
    }
  }

  // Main execution
  async run() {
    console.log('🚀 Starting data quality fixes...')
    
    await this.fixMalformedNames()
    await this.cleanupLowQualityEntities()
    await this.improveAISummaries()
    
    console.log('✅ Data quality fixes completed!')
  }
}

// Run the data quality fixer
async function main() {
  const fixer = new DataQualityFixer()
  await fixer.run()
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = DataQualityFixer
