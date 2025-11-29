import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(){
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function userClient(jwt: string){
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
}

export function splitTextIntoChunks(text: string, maxChars = 1800){
  const chunks: string[] = [];
  let i=0;
  while (i < text.length){
    chunks.push(text.slice(i, i+maxChars));
    i += maxChars;
  }
  return chunks;
}

export function safeJsonExtract(s: string){
  const m = s.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : JSON.parse(s);
}
