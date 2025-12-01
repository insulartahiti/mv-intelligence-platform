import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getServiceSupabase() {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(SUPABASE_URL, SERVICE_ROLE);
}

export async function POST(req: Request) {
    try {
        const { email } = await req.json();
        
        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        
        // Check if email exists in allowed_users table
        const { data, error } = await supabase
            .from('allowed_users')
            .select('email')
            .eq('email', email.toLowerCase())
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
            console.error('Error checking allowed users:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }

        const isAllowed = !!data;
        
        // Also check against hardcoded admins just in case, though they should be in the table
        const ADMIN_EMAILS = ['harsh.govil@motivepartners.com'];
        const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

        if (isAllowed || isAdmin) {
            return NextResponse.json({ allowed: true });
        } else {
            return NextResponse.json({ allowed: false }, { status: 403 });
        }

    } catch (error: any) {
        console.error('Check access error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

