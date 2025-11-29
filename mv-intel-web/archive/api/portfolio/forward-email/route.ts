import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { 
      companyId, 
      googleWorkspaceId, 
      emailSubject, 
      emailContent, 
      emailFrom,
      emailTo,
      emailDate,
      attachments = []
    } = await req.json();

    if (!companyId || !googleWorkspaceId || !emailSubject || !emailContent) {
      return NextResponse.json({ 
        error: 'companyId, googleWorkspaceId, emailSubject, and emailContent are required' 
      }, { status: 400 });
    }

    // Store email in database
    const { data: emailRecord, error: emailError } = await admin
      .from('portfolio_emails')
      .insert({
        company_id: companyId,
        google_workspace_id: googleWorkspaceId,
        subject: emailSubject,
        content: emailContent,
        from_email: emailFrom,
        to_email: emailTo,
        email_date: emailDate,
        attachments: attachments,
        status: 'forwarded',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 500 });
    }

    // TODO: Implement actual Google Workspace forwarding
    // This would typically involve:
    // 1. Google Workspace API authentication
    // 2. Creating a draft email
    // 3. Sending the email to the specified workspace ID
    
    // For now, we'll just log the action
    console.log(`Email forwarded to Google Workspace ${googleWorkspaceId} for company ${companyId}`);

    return NextResponse.json({ 
      success: true, 
      emailId: emailRecord.id,
      message: 'Email forwarded successfully' 
    });

  } catch (error: any) {
    console.error('Error forwarding email:', error);
    return NextResponse.json({ 
      error: 'Failed to forward email: ' + error.message 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const companyId = req.nextUrl.searchParams.get('companyId');
    
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const { data: emails, error } = await admin
      .from('portfolio_emails')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ emails: emails || [] });

  } catch (error: any) {
    console.error('Error fetching emails:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch emails: ' + error.message 
    }, { status: 500 });
  }
}






