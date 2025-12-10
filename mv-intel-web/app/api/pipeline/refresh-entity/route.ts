import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

export const dynamic = 'force-dynamic';

// Import the generator class. Note: This assumes the file is transpiled/handled correctly by Next.js
// We use require here as it's a JS file in the parent directory
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GeneratorPath = path.resolve(process.cwd(), 'mv-intel-web/enhanced_embedding_generator.js');
// Or try relative require if path resolution fails in build
// const Generator = require('../../../../enhanced_embedding_generator.js');

export async function POST(request: NextRequest) {
  try {
    const { entityId } = await request.json();

    if (!entityId) {
      return NextResponse.json({ success: false, error: 'Entity ID is required' }, { status: 400 });
    }

    console.log(`🔄 Triggering inline refresh for entity: ${entityId}`);

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    // 1. Fetch Entity
    const { data: entity, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .single();
        
    if (error || !entity) {
        console.error('Entity fetch failed:', error);
        throw new Error('Entity not found');
    }

    // 2. Clear Data (using Supabase)
    // This effectively "resets" the entity for the generator to pick up
    await supabase
        .schema('graph')
        .from('entities')
        .update({ 
            business_analysis: null, 
            ai_summary: null, 
            enriched: false,
            last_enriched_at: null 
        })
        .eq('id', entityId);

    // 3. Run Generator Inline
    // We need to require the generator dynamically to ensure env vars are loaded
    // However, Next.js bundling might make dynamic require tricky. 
    // Since we are in the same repo, we can try to import it.
    // But `enhanced_embedding_generator.js` is a CJS module.
    
    let Generator;
    try {
        // Try standard require
        Generator = require('../../../../enhanced_embedding_generator.js');
    } catch (e) {
        console.warn('Standard require failed, trying absolute path...');
        Generator = require(GeneratorPath);
    }

    const generator = new Generator();
    console.log('Starting inline enrichment...');
    await generator.processBatch([entity]);
    console.log('Inline enrichment complete.');

    return NextResponse.json({
      success: true,
      message: `Refresh completed for entity ${entityId}`
    });

  } catch (error: any) {
    console.error('❌ Error refreshing entity:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger refresh', details: error.message },
      { status: 500 }
    );
  }
}
