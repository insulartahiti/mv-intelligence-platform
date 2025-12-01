import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'


export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get entity count
    const { count: entityCount, error: entityError } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })

    if (entityError) {
      throw new Error(`Entity count error: ${entityError.message}`)
    }

    // Get edge count
    const { count: edgeCount, error: edgeError } = await supabase
      .schema('graph')
      .from('edges')
      .select('*', { count: 'exact', head: true })

    if (edgeError) {
      throw new Error(`Edge count error: ${edgeError.message}`)
    }

    // Get last sync timestamp
    const { data: syncState, error: syncError } = await supabase
      .schema('graph')
      .from('sync_state')
      .select('last_sync_timestamp')
      .order('last_sync_timestamp', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      success: true,
      totalEntities: entityCount || 0,
      totalRelationships: edgeCount || 0,
      lastSync: syncState?.last_sync_timestamp || null
    })

  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
