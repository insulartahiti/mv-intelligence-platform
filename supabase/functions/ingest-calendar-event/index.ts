import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const ev = await req.json();
    if (!ev.orgId || !ev.title || !ev.starts_at) return new Response("Missing fields", { status:400 });
    const row = {
      org_id: ev.orgId,
      title: ev.title,
      description: ev.description || null,
      location: ev.location || null,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at || null,
      attendees: ev.attendees || [],
      external_source: ev.external_source || null,
      external_id: ev.external_id || null
    };
    const { error } = await admin.from("events").insert(row);
    if (error) throw error;
    return new Response(JSON.stringify({ ok:true }), { headers:{ "Content-Type":"application/json" } });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500 });
  }
});
