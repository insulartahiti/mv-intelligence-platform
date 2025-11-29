import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function domainOf(email: string) {
  const m = /@([A-Za-z0-9.-]+)$/.exec((email||"").toLowerCase()); return m ? m[1] : null;
}

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { orgId, sinceHours = 48 } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    const since = new Date(Date.now() - sinceHours*3600*1000).toISOString();
    const { data: evts, error } = await admin.from("events")
      .select("id, attendees, company_id")
      .eq("org_id", orgId)
      .gte("starts_at", since);
    if (error) throw error;

    let updated = 0;
    for (const e of (evts||[])) {
      if (e.company_id) continue;
      const domains = new Set((e.attendees||[]).map((a:any)=> domainOf(a.email||"")).filter(Boolean));
      if (domains.size === 0) continue;
      // match company by domain (exact first)
      const domainList = Array.from(domains);
      const { data: comps } = await admin.from("companies").select("id,domain").eq("org_id", orgId).in("domain", domainList);
      let companyId = comps?.[0]?.id;
      if (!companyId) {
        // try fuzzy: company with name appearing in email domain prefix
        const likes = domainList.map(d=> d.split(".")[0]); // crude heuristic
        const { data: comps2 } = await admin.from("companies").select("id,name,domain").eq("org_id", orgId).in("name", likes);
        companyId = comps2?.[0]?.id;
      }
      if (companyId) {
        await admin.from("events").update({ company_id: companyId }).eq("id", e.id);
        updated++;
      }
      await new Promise(res=>setTimeout(res, 50));
    }

    return new Response(JSON.stringify({ ok:true, updated }), { headers: { "Content-Type":"application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
