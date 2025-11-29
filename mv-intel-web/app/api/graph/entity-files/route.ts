import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entityId')

    if (!entityId) {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      )
    }

    // Get files for the entity
    const { data: files, error: filesError } = await supabase
      .schema('graph')
      .from('affinity_files')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (filesError) {
      throw new Error(`Files fetch error: ${filesError.message}`)
    }

    return NextResponse.json({
      success: true,
      files: files || []
    })

  } catch (error) {
    console.error('Entity files API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch entity files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
