import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(url, key);
}

/**
 * GET /api/portfolio/mapping-suggestions?companyId=xxx&status=pending
 * 
 * Fetch mapping suggestions for a company
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status'); // pending, approved, rejected, auto_approved
    
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('line_item_mapping_suggestions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[Mapping Suggestions API] Error fetching:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Group by status for easy UI consumption
    const grouped = {
      pending: data?.filter(s => s.status === 'pending') || [],
      approved: data?.filter(s => s.status === 'approved') || [],
      auto_approved: data?.filter(s => s.status === 'auto_approved') || [],
      rejected: data?.filter(s => s.status === 'rejected') || []
    };
    
    return NextResponse.json({
      suggestions: data || [],
      grouped,
      counts: {
        pending: grouped.pending.length,
        approved: grouped.approved.length,
        auto_approved: grouped.auto_approved.length,
        rejected: grouped.rejected.length,
        total: data?.length || 0
      }
    });
  } catch (err: any) {
    console.error('[Mapping Suggestions API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/portfolio/mapping-suggestions
 * 
 * Update a suggestion's status (approve/reject) or canonical name
 * Body: { id: string, status: 'approved' | 'rejected', canonical?: string, reviewedBy?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, canonical, reviewedBy } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    
    if (status && !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (status) {
      updateData.status = status;
      updateData.reviewed_at = new Date().toISOString();
      if (reviewedBy) {
        updateData.reviewed_by = reviewedBy;
      }
    }
    
    if (canonical) {
      updateData.suggested_canonical = canonical;
    }
    
    const { data, error } = await supabase
      .from('line_item_mapping_suggestions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[Mapping Suggestions API] Error updating:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, suggestion: data });
  } catch (err: any) {
    console.error('[Mapping Suggestions API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/mapping-suggestions
 * 
 * Manually create a new mapping suggestion
 * Body: { companyId: string, originalName: string, suggestedCanonical: string, reasoning?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, originalName, suggestedCanonical, reasoning } = body;
    
    if (!companyId || !originalName || !suggestedCanonical) {
      return NextResponse.json({ 
        error: 'companyId, originalName, and suggestedCanonical are required' 
      }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // Normalize the original name
    const normalized = originalName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    
    const { data, error } = await supabase
      .from('line_item_mapping_suggestions')
      .upsert({
        company_id: companyId,
        original_name: normalized,
        suggested_canonical: suggestedCanonical,
        confidence: 1.0, // Manual entry = full confidence
        reasoning: reasoning || 'Manually created',
        status: 'approved' // Manual entries are auto-approved
      }, {
        onConflict: 'company_id,original_name'
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Mapping Suggestions API] Error creating:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, suggestion: data });
  } catch (err: any) {
    console.error('[Mapping Suggestions API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/mapping-suggestions?id=xxx
 * 
 * Delete a suggestion
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('line_item_mapping_suggestions')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[Mapping Suggestions API] Error deleting:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Mapping Suggestions API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
