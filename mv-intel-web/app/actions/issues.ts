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
    try {
      // Detect mime type (default to png if missing) from base64 header
      const matches = screenshotBase64.match(/^data:(image\/[a-z]+);base64,/);
      const mimeType = matches ? matches[1] : 'image/png';
      const extension = mimeType.split('/')[1];

      // Remove header
      const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
      
      // Validation: Check size (approximate)
      if (base64Data.length > 2 * 1024 * 1024) { // > ~1.5MB encoded
          console.warn('Screenshot too large, skipping upload');
      } else {
          const buffer = Buffer.from(base64Data, 'base64');
          const fileName = `${userId}_${Date.now()}.${extension}`;

          const { error: uploadError } = await supabase
            .storage
            .from('issue-screenshots')
            .upload(fileName, buffer, {
              contentType: mimeType,
              upsert: true
            });

          if (!uploadError) {
            const { data } = supabase.storage.from('issue-screenshots').getPublicUrl(fileName);
            screenshotUrl = data.publicUrl;
          } else {
            console.error('Screenshot upload failed:', uploadError);
          }
      }
    } catch (e) {
        console.error('Screenshot processing error:', e);
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
  
  const { data: issues, error } = await supabase
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Enrich with user details manually since we can't join auth.users directly via PostgREST
  // 1. Get unique user IDs
  const userIds = Array.from(new Set(issues.map(i => i.user_id))).filter(Boolean);
  
  // 2. Fetch users in parallel
  const userMap = new Map();
  await Promise.all(userIds.map(async (uid) => {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(uid);
      if (user) userMap.set(uid, user);
    } catch (e) {
      console.warn(`Failed to fetch user ${uid}`, e);
    }
  }));

  // 3. Attach profiles
  const enrichedIssues = issues.map(issue => ({
    ...issue,
    profiles: {
      email: userMap.get(issue.user_id)?.email || 'Unknown',
      full_name: userMap.get(issue.user_id)?.user_metadata?.full_name || 'Unknown'
    }
  }));

  return enrichedIssues;
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
