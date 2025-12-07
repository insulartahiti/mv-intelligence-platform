'use server';

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function submitIssue(
  screenshotBase64: string | null, 
  comment: string, 
  path: string, 
  userId: string
) {
  const supabase = getSupabaseAdmin();
  let screenshotUrl = null;

  // 1. Upload Screenshot if exists
  if (screenshotBase64) {
    // Detect mime type (default to png if missing) from base64 header
    const matches = screenshotBase64.match(/^data:(image\/[a-z]+);base64,/);
    const mimeType = matches ? matches[1] : 'image/png';
    const extension = mimeType.split('/')[1];

    // Remove header
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${userId}_${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase
      .storage
      .from('issue-screenshots')
      .upload(fileName, buffer, {
        contentType: mimeType
      });

    if (!uploadError) {
      const { data } = supabase.storage.from('issue-screenshots').getPublicUrl(fileName);
      screenshotUrl = data.publicUrl;
    } else {
      console.error('Screenshot upload failed:', uploadError);
    }
  }

  // 2. Analyze with GPT-4o Vision
  let aiSummary = "No analysis available.";
  try {
    const messages: any[] = [
      {
        role: "system",
        content: "You are a QA engineer. Analyze the user report and screenshot (if provided). \n" +
                 "Generate a concise technical summary of the potential issue, reproduction steps if inferable, and estimate priority.\n" +
                 "Format: **Issue:** ...\n**Context:** ...\n**Potential Cause:** ..."
      },
      {
        role: "user",
        content: [
          { type: "text", text: `User Comment: ${comment}\nPage Path: ${path}` },
        ]
      }
    ];

    if (screenshotUrl) {
      messages[1].content.push({
        type: "image_url",
        image_url: {
          url: screenshotUrl
        }
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 500
    });

    aiSummary = response.choices[0].message.content || aiSummary;

  } catch (error) {
    console.error('AI Analysis failed:', error);
  }

  // 3. Insert Issue
  const { data, error } = await supabase
    .from('issues')
    .insert({
      user_id: userId,
      description: comment,
      path,
      screenshot_url: screenshotUrl,
      ai_summary: aiSummary,
      status: 'open',
      priority: 'medium' // Could parse this from AI response too
    })
    .select()
    .single();

  if (error) throw new Error('Failed to submit issue: ' + error.message);
  return data;
}

export async function getIssues() {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('issues')
    .select(`
        *,
        profiles:user_id (email, full_name)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateIssueStatus(id: string, status: string, priority: string) {
  const supabase = getSupabaseAdmin();
  
  const { error } = await supabase
    .from('issues')
    .update({ status, priority, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
  return true;
}
