'use server';

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { cookies } from 'next/headers';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getSupabaseUser() {
    // For server actions where we want to respect RLS or get current user
    // We can use the service role key but pass the user's access token if available,
    // or just use the service role key and manually check auth.
    // Simpler here: use service role key but verify user ID via cookies/auth first.
    // Ideally we use createServerClient from @supabase/ssr but let's stick to simple logic.
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function getSuggestions() {
  const supabase = getSupabaseUser();
  
  // Get current user ID if possible
  const cookieStore = cookies();
  // We'd typically get the session here to know which user liked what
  // For simplicity, we'll fetch all and let the client handle "liked by me" if we can pass the user ID down,
  // or we can fetch the user ID here.
  
  // Note: Since we are in a server action, we can't easily access the client-side session without cookies.
  // We'll return the raw data and votes.
  
  const { data: suggestions, error } = await supabase
    .from('suggestions')
    .select(`
      *,
      suggestion_votes (user_id)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching suggestions:', error);
    return [];
  }

  // Process suggestions to add vote count and liked status
  // We need the current user ID to check 'liked_by_me'. 
  // We can try to get it from the standard auth cookie if Supabase auth is set up that way.
  
  // For now, return the data structure and let the client calculate counts/liked status or do it here.
  // Let's do it here.
  
  return suggestions.map((s: any) => ({
    ...s,
    vote_count: s.suggestion_votes.length,
    votes: s.suggestion_votes // Client can check if their ID is in this list
  })).sort((a: any, b: any) => b.vote_count - a.vote_count);
}

export async function createSuggestion(title: string, description: string, userId: string) {
  const supabase = getSupabaseAdmin();

  // 1. Fetch existing open suggestions
  const { data: existing } = await supabase
    .from('suggestions')
    .select('id, title, description')
    .neq('status', 'rejected');

  const existingList = existing?.map(e => `ID: ${e.id}\nTitle: ${e.title}\nDescription: ${e.description}`).join('\n---\n') || '';

  // 2. Check for duplicates/overlap
  const systemPrompt = `
    You are a product manager helper. 
    Check if the new feature request matches or logically overlaps significantly with any existing requests.
    
    If it matches/overlaps:
    - Return JSON with { "match": true, "matchId": "uuid", "rewrittenTitle": "...", "rewrittenDescription": "..." }
    - The rewritten title and description should combine the best parts of the existing request and the new request.
    
    If it does NOT match:
    - Return JSON with { "match": false }
  `;

  const userPrompt = `
    New Request:
    Title: ${title}
    Description: ${description}

    Existing Requests:
    ${existingList}
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content || '{}');

  if (result.match && result.matchId) {
    // Update existing
    const { error } = await supabase
      .from('suggestions')
      .update({
        title: result.rewrittenTitle,
        description: result.rewrittenDescription,
        updated_at: new Date().toISOString(),
        ai_summary: `Merged with new request: "${title}" on ${new Date().toLocaleDateString()}`
      })
      .eq('id', result.matchId);

    if (error) throw new Error('Failed to update existing suggestion');
    return { status: 'merged', id: result.matchId };
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('suggestions')
      .insert({
        user_id: userId,
        title,
        description,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw new Error('Failed to create suggestion');
    return { status: 'created', id: data.id };
  }
}

export async function toggleVote(suggestionId: string, userId: string) {
  const supabase = getSupabaseAdmin();

  // Check if vote exists
  const { data: existing } = await supabase
    .from('suggestion_votes')
    .select('*')
    .eq('suggestion_id', suggestionId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Remove vote
    await supabase
      .from('suggestion_votes')
      .delete()
      .eq('suggestion_id', suggestionId)
      .eq('user_id', userId);
    return { voted: false };
  } else {
    // Add vote
    await supabase
      .from('suggestion_votes')
      .insert({
        suggestion_id: suggestionId,
        user_id: userId
      });
    return { voted: true };
  }
}
