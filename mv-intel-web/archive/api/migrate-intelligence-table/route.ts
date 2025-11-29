import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
  auth: { persistSession: false } 
});

export async function POST(req: NextRequest) {
  try {
    console.log('🔄 Running intelligence overlays table migration...');

    // Add new columns to intelligence_overlays table
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE intelligence_overlays 
        ADD COLUMN IF NOT EXISTS investment_thesis TEXT,
        ADD COLUMN IF NOT EXISTS market_analysis TEXT,
        ADD COLUMN IF NOT EXISTS due_diligence_priorities TEXT[];
      `
    });

    if (error) {
      console.error('Migration error:', error);
      return NextResponse.json(
        { error: 'Migration failed', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Migration completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Intelligence overlays table enhanced with new columns'
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
