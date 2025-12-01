import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();
        if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data } = await supabase
            .from('allowed_users')
            .select('id')
            .ilike('email', email)
            .maybeSingle();

        if (data) {
            return NextResponse.json({ allowed: true });
        } else {
            return NextResponse.json({ allowed: false }, { status: 403 }); // 403 Forbidden
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

