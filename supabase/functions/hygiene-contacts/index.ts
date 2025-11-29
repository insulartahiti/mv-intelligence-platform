import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, dryRun = true, max = 1000 } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    const { data: contacts } = await admin.from("contacts")
      .select("id,name,email,normalized_email,company_id")
      .eq("org_id", orgId)
      .limit(50000);
    // dedupe by normalized_email
    const buckets: Record<string, any[]> = {};
    for (const c of (contacts||[])){
      const k = (c.normalized_email || "").trim();
      if (!k) continue;
      buckets[k] = buckets[k] || [];
      buckets[k].push(c);
    }
    const suggestions:any[] = [];
    for (const [k, arr] of Object.entries(buckets)){
      if (arr.length > 1){
        const keep = arr[0];
        const dups = arr.slice(1);
        suggestions.push({ normalized_email: k, keep, dups });
      }
    }

    if (!dryRun){
      let merged = 0;
      for (const s of suggestions.slice(0, max)){
        // Repoint relationships to keep.id, delete dups
        const ids = s.dups.map((d:any)=>d.id);
        if (ids.length){
          await admin.from("relationships").update({ from_contact: s.keep.id }).in("from_contact", ids);
          await admin.from("embeddings").update({ contact_id: s.keep.id }).in("contact_id", ids);
          await admin.from("contacts").delete().in("id", ids);
          merged += ids.length;
        }
      }
      return new Response(JSON.stringify({ ok:true, merged }), { headers:{ "Content-Type":"application/json" } });
    }

    return new Response(JSON.stringify({ ok:true, suggestions: suggestions.slice(0, 200) }), { headers:{ "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
