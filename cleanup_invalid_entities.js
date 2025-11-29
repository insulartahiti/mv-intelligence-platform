require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class InvalidEntityCleanup {
  constructor() {
    this.stats = {
      checked: 0,
      deleted: 0,
      errors: 0
    };
  }

  // Check if entity is invalid
  isInvalidEntity(entity) {
    const name = entity.name.trim();
    
    // Single names (likely invalid)
    if (!name.includes(' ') && name.length < 10) {
      return { invalid: true, reason: 'single_name' };
    }
    
    // Job titles
    const jobTitlePatterns = [
      /^(CEO|CTO|CFO|COO|VP|Director|Manager|Head|Lead|Senior|Junior|Associate|Assistant|Special|Deputy)/i,
      /(Manager|Director|CEO|CTO|CFO|COO|VP|Head|Lead|Senior|Junior|Associate|Assistant|Special|Deputy)$/i
    ];
    
    if (jobTitlePatterns.some(pattern => pattern.test(name))) {
      return { invalid: true, reason: 'job_title' };
    }
    
    // Malformed names with parentheses at the end
    if (name.endsWith(')') && !name.includes('(')) {
      return { invalid: true, reason: 'malformed_parentheses' };
    }
    
    // Very short names
    if (name.length < 3) {
      return { invalid: true, reason: 'too_short' };
    }
    
    // Names that are just numbers or special characters
    if (!/[a-zA-Z]/.test(name)) {
      return { invalid: true, reason: 'no_letters' };
    }
    
    return { invalid: false };
  }

  // Delete invalid entity
  async deleteEntity(entityId, reason) {
    try {
      // First delete any edges connected to this entity
      await supabase
        .schema('graph')
        .from('edges')
        .delete()
        .or(`source_id.eq.${entityId},target_id.eq.${entityId}`);

      // Then delete the entity
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .delete()
        .eq('id', entityId);

      if (error) {
        console.error(`Error deleting entity ${entityId}:`, error);
        this.stats.errors++;
        return false;
      }

      this.stats.deleted++;
      return true;
    } catch (error) {
      console.error(`Error deleting entity ${entityId}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  // Process entities in batches
  async processBatch(limit = 100) {
    const { data: entities, error } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type')
      .limit(limit);

    if (error) {
      console.error('Error fetching entities:', error);
      return false;
    }

    if (entities.length === 0) {
      console.log('No more entities to check');
      return false;
    }

    console.log(`\n🔍 Checking ${entities.length} entities...`);

    const invalidEntities = [];
    
    for (const entity of entities) {
      this.stats.checked++;
      const validation = this.isInvalidEntity(entity);
      
      if (validation.invalid) {
        invalidEntities.push({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          reason: validation.reason
        });
      }
    }

    console.log(`❌ Found ${invalidEntities.length} invalid entities:`);
    
    // Group by reason
    const groupedByReason = {};
    invalidEntities.forEach(entity => {
      if (!groupedByReason[entity.reason]) {
        groupedByReason[entity.reason] = [];
      }
      groupedByReason[entity.reason].push(entity);
    });

    Object.entries(groupedByReason).forEach(([reason, entities]) => {
      console.log(`  ${reason}: ${entities.length} entities`);
      entities.slice(0, 5).forEach(entity => {
        console.log(`    - "${entity.name}" (${entity.type})`);
      });
      if (entities.length > 5) {
        console.log(`    ... and ${entities.length - 5} more`);
      }
    });

    // Ask for confirmation before deletion
    if (invalidEntities.length > 0) {
      console.log(`\n⚠️  About to delete ${invalidEntities.length} invalid entities...`);
      
      // Delete in batches
      for (let i = 0; i < invalidEntities.length; i += 10) {
        const batch = invalidEntities.slice(i, i + 10);
        
        for (const entity of batch) {
          const success = await this.deleteEntity(entity.id, entity.reason);
          if (success) {
            console.log(`🗑️  Deleted: "${entity.name}" (${entity.reason})`);
          }
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return true;
  }

  // Run cleanup
  async run() {
    console.log('🧹 Starting Invalid Entity Cleanup...');
    
    let hasMore = true;
    let batchCount = 0;
    
    while (hasMore && batchCount < 50) { // Limit to 50 batches
      batchCount++;
      console.log(`\n🔄 Processing batch ${batchCount}/50`);
      
      hasMore = await this.processBatch(100);
      
      console.log(`📊 Progress: ${this.stats.checked} checked, ${this.stats.deleted} deleted, ${this.stats.errors} errors`);
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n🎉 Cleanup completed!');
    console.log(`📊 Final stats: ${this.stats.checked} checked, ${this.stats.deleted} deleted, ${this.stats.errors} errors`);
  }
}

// Run cleanup
if (require.main === module) {
  const cleanup = new InvalidEntityCleanup();
  cleanup.run().catch(console.error);
}

module.exports = InvalidEntityCleanup;
