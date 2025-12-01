import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@supabase/supabase-js'; // Standard client for auth check
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Admin Email List (Hardcoded for MVP security)
const ADMIN_EMAILS = ['harsh.govil@motivepartners.com'];

// 1. Helper to verify Admin
async function verifyAdmin(req: Request) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    // We need to pass the user's session token to Supabase to verify who they are
    // In an App Router API route, we can get the auth header or cookies
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) return null;

    const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;
    if (!ADMIN_EMAILS.includes(user.email || '')) return null;

    return user;
}

// 2. Service Role Client (Bypasses RLS)
function getServiceSupabase() {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(SUPABASE_URL, SERVICE_ROLE);
}

export async function GET(req: Request) {
    if (!await verifyAdmin(req)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
        .from('allowed_users')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify(data), { status: 200 });
}

export async function POST(req: Request) {
    if (!await verifyAdmin(req)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = getServiceSupabase();
    try {
        const { email, name } = await req.json();
        if (!email) return new Response(JSON.stringify({ error: 'Email required' }), { status: 400 });

        const { error } = await supabase
            .from('allowed_users')
            .insert({ email: email.toLowerCase(), name })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return new Response(JSON.stringify({ error: 'User already exists' }), { status: 409 });
            throw error;
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

export async function DELETE(req: Request) {
    if (!await verifyAdmin(req)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const supabase = getServiceSupabase();
    const { error } = await supabase.from('allowed_users').delete().eq('id', id);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
}

