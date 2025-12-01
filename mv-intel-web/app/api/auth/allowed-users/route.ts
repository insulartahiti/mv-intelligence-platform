
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { email, name } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 });
    }

    const { error } = await supabase
      .from('allowed_users')
      .insert({ email: email.toLowerCase(), name })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation gracefully
      if (error.code === '23505') {
          return new Response(JSON.stringify({ error: 'User already allowed' }), { status: 409 });
      }
      throw error;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error('Error adding allowed user:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

