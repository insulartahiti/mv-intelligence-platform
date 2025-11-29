import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const FROM_EMAIL = process.env.MV_FROM_EMAIL || 'no-reply@mvintel.local';

async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string; }){
  if (RESEND_API_KEY){
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text })
    });
    if (!r.ok) throw new Error(`Resend error ${r.status}`);
    return true;
  } else if (POSTMARK_API_KEY){
    const r = await fetch('https://api.postmarkapp.com/email', {
      method:'POST',
      headers:{ 'X-Postmark-Server-Token': POSTMARK_API_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ From: FROM_EMAIL, To: to, Subject: subject, TextBody: text })
    });
    if (!r.ok) throw new Error(`Postmark error ${r.status}`);
    return true;
  } else {
    throw new Error('No email provider configured');
  }
}

export async function POST(req: NextRequest){
  const { to, subject, brief } = await req.json();
  if (!to || !brief) return NextResponse.json({ error: 'to and brief required' }, { status: 400 });
  await sendEmail({ to, subject: subject || 'Meeting brief', text: brief });
  return NextResponse.json({ ok:true });
}
