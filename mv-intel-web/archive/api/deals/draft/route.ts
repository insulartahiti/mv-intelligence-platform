import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { orgId, dealId, companyId, opportunityId } = await req.json();
    
    if (!orgId || !dealId) {
      return NextResponse.json({ error: 'orgId and dealId required' }, { status: 400 });
    }

    // Call the Supabase Edge Function for memo generation
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const functionUrl = `${supabaseUrl}/functions/v1/draft-memo`;
    const webhookSecret = process.env.MV_WEBHOOK_SECRET || '';

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(webhookSecret && { 'x-mv-signature': webhookSecret })
      },
      body: JSON.stringify({
        orgId,
        companyId: companyId || dealId, // Use dealId as companyId if not provided
        opportunityId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error calling draft-memo function:', errorText);
      return NextResponse.json({ 
        error: 'Failed to generate memo',
        details: errorText 
      }, { status: 500 });
    }

    const result = await response.json();
    
    if (!result.ok) {
      return NextResponse.json({ 
        error: result.error || 'Failed to generate memo' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      memo: result.markdown,
      id: result.id 
    });

  } catch (error: any) {
    console.error('Error in draft memo POST:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}






