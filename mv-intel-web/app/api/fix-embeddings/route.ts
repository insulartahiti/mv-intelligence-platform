import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fixing embedding dimensions...');

    // Update entities table
    const { error: entitiesError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE graph.entities ALTER COLUMN embedding TYPE vector(3072);'
    });

    if (entitiesError) {
      console.error('Error updating entities table:', entitiesError);
      return NextResponse.json({
        success: false,
        error: `Error updating entities table: ${entitiesError.message}`
      }, { status: 500 });
    }

    console.log('✅ Updated entities.embedding to vector(3072)');

    // Update affinity_files table
    const { error: filesError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE graph.affinity_files ALTER COLUMN embedding TYPE vector(3072);'
    });

    if (filesError) {
      console.error('Error updating affinity_files table:', filesError);
      return NextResponse.json({
        success: false,
        error: `Error updating affinity_files table: ${filesError.message}`
      }, { status: 500 });
    }

    console.log('✅ Updated affinity_files.embedding to vector(3072)');

    return NextResponse.json({
      success: true,
      message: 'Embedding dimensions fixed successfully!'
    });

  } catch (error) {
    console.error('Error fixing embeddings:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
