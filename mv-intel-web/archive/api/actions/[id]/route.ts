import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updates = await req.json();
    
    if (!id) {
      return NextResponse.json({ error: 'Action ID required' }, { status: 400 });
    }

    const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
    
    const { data, error } = await admin
      .from('actions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ action: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json({ error: 'Action ID required' }, { status: 400 });
    }

    const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
    
    const { data, error } = await admin
      .from('actions')
      .select(`
        *,
        related_company:companies!actions_related_company_fkey(id, name),
        related_contact:contacts!actions_related_contact_fkey(id, name),
        created_by:profiles!actions_created_by_fkey(full_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json({ action: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
