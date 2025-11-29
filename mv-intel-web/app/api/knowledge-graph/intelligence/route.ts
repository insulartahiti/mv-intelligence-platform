import { NextRequest, NextResponse } from 'next/server';

const FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/intelligence-overlay`;
const BATCH_FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/batch-intelligence-update`;
const SCHEDULER_FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scheduler`;
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type = 'single', ...params } = body;

    let funcUrl: string;
    let payload: any;

    switch (type) {
      case 'single':
        // Generate intelligence for a single contact
        if (!params.contact_id && !params.company_id) {
          return NextResponse.json(
            { ok: false, error: "contact_id or company_id is required for single intelligence update" },
            { status: 400 }
          );
        }
        funcUrl = FUNC_URL;
        payload = params;
        break;

      case 'batch':
        // Batch intelligence update
        funcUrl = BATCH_FUNC_URL;
        payload = {
          update_type: params.update_type || 'stale',
          limit: params.limit || 50,
          contact_ids: params.contact_ids
        };
        break;

      case 'schedule':
        // Run scheduled tasks
        funcUrl = SCHEDULER_FUNC_URL;
        payload = {
          schedule_type: params.schedule_type || 'daily'
        };
        break;

      default:
        return NextResponse.json(
          { ok: false, error: "Invalid type. Must be 'single', 'batch', or 'schedule'" },
          { status: 400 }
        );
    }

    const response = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mv-signature': WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });

  } catch (error: any) {
    console.error('Error during intelligence update:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update intelligence' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contact_id');
    const companyId = searchParams.get('company_id');
    const type = searchParams.get('type') || 'single';

    if (type === 'single' && !contactId && !companyId) {
      return NextResponse.json(
        { ok: false, error: "contact_id or company_id is required" },
        { status: 400 }
      );
    }

    let funcUrl: string;
    let payload: any;

    switch (type) {
      case 'single':
        funcUrl = FUNC_URL;
        payload = { contact_id: contactId, company_id: companyId };
        break;

      case 'batch':
        funcUrl = BATCH_FUNC_URL;
        payload = {
          update_type: searchParams.get('update_type') || 'stale',
          limit: parseInt(searchParams.get('limit') || '50')
        };
        break;

      case 'schedule':
        funcUrl = SCHEDULER_FUNC_URL;
        payload = {
          schedule_type: searchParams.get('schedule_type') || 'daily'
        };
        break;

      default:
        return NextResponse.json(
          { ok: false, error: "Invalid type. Must be 'single', 'batch', or 'schedule'" },
          { status: 400 }
        );
    }

    const response = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mv-signature': WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });

  } catch (error: any) {
    console.error('Error during intelligence query:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to query intelligence' },
      { status: 500 }
    );
  }
}
