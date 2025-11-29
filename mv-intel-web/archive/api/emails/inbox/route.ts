import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const priority = searchParams.get('priority') || 'all';
    const portfolioRelevant = searchParams.get('portfolio_relevant') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('email_inbox')
      .select('*')
      .order('email_date', { ascending: false })
      .limit(limit);

    // Apply filters
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (priority !== 'all') {
      query = query.eq('priority', priority);
    }

    if (portfolioRelevant) {
      query = query.eq('portfolio_relevant', true);
    }

    const { data: emails, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get portfolio-relevant emails using the function
    const { data: portfolioEmails, error: portfolioError } = await supabase
      .rpc('get_portfolio_emails', { limit_count: limit });

    if (portfolioError) {
      console.warn('Error fetching portfolio emails:', portfolioError);
    }

    return NextResponse.json({
      emails: emails || [],
      portfolioEmails: portfolioEmails || [],
      total: emails?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching inbox emails:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch inbox emails: ' + error.message 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { 
      emailId, 
      subject, 
      from, 
      to, 
      date, 
      content, 
      htmlContent, 
      attachments = [],
      priority = 'medium'
    } = await req.json();

    if (!emailId || !subject || !from || !to) {
      return NextResponse.json({ 
        error: 'emailId, subject, from, and to are required' 
      }, { status: 400 });
    }

    // Determine if email is portfolio-relevant
    const portfolioRelevant = await determinePortfolioRelevance(subject, content);

    // Insert email into inbox
    const { data: email, error } = await supabase
      .from('email_inbox')
      .insert({
        email_id: emailId,
        subject,
        from_email: from,
        to_email: to,
        email_date: date,
        content,
        html_content: htmlContent,
        attachments,
        priority,
        portfolio_relevant: portfolioRelevant,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If portfolio-relevant, trigger processing
    if (portfolioRelevant) {
      try {
        await processEmail(emailId);
      } catch (processError) {
        console.warn('Error processing email:', processError);
      }
    }

    return NextResponse.json({
      success: true,
      email,
      message: 'Email added to inbox successfully'
    });

  } catch (error: any) {
    console.error('Error adding email to inbox:', error);
    return NextResponse.json({ 
      error: 'Failed to add email to inbox: ' + error.message 
    }, { status: 500 });
  }
}

async function determinePortfolioRelevance(subject: string, content: string): Promise<boolean> {
  try {
    // Simple keyword-based relevance check
    const portfolioKeywords = [
      'portfolio', 'investment', 'funding', 'revenue', 'growth', 'metrics',
      'kpi', 'arr', 'mrr', 'valuation', 'exit', 'ipo', 'acquisition',
      'deal', 'pitch', 'presentation', 'board', 'investor', 'fund'
    ];

    const text = `${subject} ${content}`.toLowerCase();
    const keywordMatches = portfolioKeywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );

    return keywordMatches.length >= 2; // At least 2 portfolio keywords

  } catch (error) {
    console.warn('Error determining portfolio relevance:', error);
    return false;
  }
}

async function processEmail(emailId: string) {
  try {
    // Call the email processing API
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/emails/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ emailId })
    });

    if (!response.ok) {
      throw new Error(`Email processing failed: ${response.status}`);
    }

    console.log(`✅ Email ${emailId} processed successfully`);

  } catch (error) {
    console.error('Error processing email:', error);
    throw error;
  }
}
