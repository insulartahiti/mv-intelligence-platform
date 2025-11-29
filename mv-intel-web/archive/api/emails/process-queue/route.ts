import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

export async function POST(req: NextRequest) {
  try {
    const { batchSize = 5 } = await req.json();

    console.log(`🔄 Processing email queue (batch size: ${batchSize})`);

    // Get pending emails
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('email_inbox')
      .select('*')
      .eq('status', 'pending')
      .eq('portfolio_relevant', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No pending emails to process'
      });
    }

    console.log(`📧 Found ${pendingEmails.length} pending emails to process`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each email
    for (const email of pendingEmails) {
      try {
        // Update status to processing
        await supabase
          .from('email_inbox')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', email.id);

        // Process the email
        const processResult = await processEmail(email);

        if (processResult.success) {
          // Update status to processed
          await supabase
            .from('email_inbox')
            .update({ 
              status: 'processed', 
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id);

          successCount++;
          results.push({
            emailId: email.email_id,
            status: 'success',
            insights: processResult.insights?.length || 0,
            kpis: processResult.extractedKPIs?.length || 0
          });
        } else {
          throw new Error(processResult.error || 'Processing failed');
        }

      } catch (error: any) {
        console.error(`❌ Error processing email ${email.email_id}:`, error);

        // Update status to failed
        await supabase
          .from('email_inbox')
          .update({ 
            status: 'failed', 
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        errorCount++;
        results.push({
          emailId: email.email_id,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Queue processing completed: ${successCount} success, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      processed: successCount,
      errors: errorCount,
      results,
      message: `Processed ${successCount} emails successfully, ${errorCount} errors`
    });

  } catch (error: any) {
    console.error('Error processing email queue:', error);
    return NextResponse.json({ 
      error: 'Failed to process email queue: ' + error.message 
    }, { status: 500 });
  }
}

async function processEmail(email: any) {
  try {
    // Call the email processing API
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('127.0.0.1:54321', 'localhost:3000')}/api/emails/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        emailId: email.email_id,
        subject: email.subject,
        content: email.content,
        from: email.from_email,
        to: email.to_email,
        date: email.email_date,
        attachments: email.attachments || [],
        htmlContent: email.html_content
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error('Error in processEmail:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get queue status
    const { data: queueStats, error } = await supabase
      .from('email_inbox')
      .select('status')
      .in('status', ['pending', 'processing', 'processed', 'failed']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stats = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      total: 0
    };

    queueStats?.forEach(email => {
      stats[email.status as keyof typeof stats]++;
      stats.total++;
    });

    return NextResponse.json({
      success: true,
      queueStats: stats,
      message: 'Queue status retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error getting queue status:', error);
    return NextResponse.json({ 
      error: 'Failed to get queue status: ' + error.message 
    }, { status: 500 });
  }
}
