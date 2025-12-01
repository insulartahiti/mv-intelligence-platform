// Script to reclassify entities with "Unknown" or invalid taxonomy
// Run with: node scripts/fix_taxonomy.js

const path = require('path');
const fs = require('fs');

// Load environment variables manually
// We are in mv-intel-web/scripts/
// .env.local is in mv-intel-web/
const envPath = path.resolve(__dirname, '../.env.local');
console.log('Trying to load env from:', envPath);

if (fs.existsSync(envPath)) {
    const result = require('dotenv').config({ path: envPath });
    if (result.error) {
        console.error('❌ Dotenv failed:', result.error);
    } else {
        console.log('✅ Dotenv loaded variables:', Object.keys(result.parsed).length);
    }
} else {
    console.warn('⚠️ .env.local not found at:', envPath);
}

// Verify Supabase keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing (Process Env Check)');
    console.log('Current keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    // Don't exit yet, let generator try
}

const EnhancedEmbeddingGenerator = require('../enhanced_embedding_generator');
const { createClient } = require('@supabase/supabase-js');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Cannot proceed without credentials.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function main() {
    console.log('🔍 Scanning for entities with invalid or unknown taxonomy...');

    // Find entities that need fixing
    // Criteria: 
    // 1. taxonomy is null
    // 2. taxonomy is 'IFT.UNKNOWN'
    // 3. taxonomy contains 'UNKNOWN'
    // 4. taxonomy doesn't start with 'IFT.' (invalid format)
    
    // We fetch in batches to avoid memory issues
    const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('type', 'organization')
        .or('taxonomy.is.null,taxonomy.eq.IFT.UNKNOWN,taxonomy.ilike.%UNKNOWN%')
        .limit(20); // Small limit for testing

    if (error) {
        console.error('❌ Error fetching entities:', error);
        process.exit(1);
    }

    if (!entities || entities.length === 0) {
        console.log('✅ No entities found requiring reclassification.');
        return;
    }

    console.log(`Found ${entities.length} entities to reclassify (sample).`);

    // Initialize Generator
    const generator = new EnhancedEmbeddingGenerator();
    
    // Process them
    console.log('🚀 Starting reclassification process...');
    
    await generator.processBatch(entities);

    console.log('✅ Batch complete.');
}

main().catch(console.error);
