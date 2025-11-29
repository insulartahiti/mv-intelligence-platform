import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

function scoreRecency(dt?: string | null){
  if (!dt) return 0;
  const days = (Date.now() - new Date(dt).getTime()) / (1000*3600*24);
  // 0 days => 1, 180+ days => ~0
  const s = Math.max(0, Math.min(1, 1 - (days/180)));
  return Number(s.toFixed(3));
}
function scoreFrequency(count: number){
  // saturating curve: 0..20+
  const s = Math.max(0, Math.min(1, Math.tanh((count||0)/8)));
  return Number(s.toFixed(3));
}
function combine(recency:number, freq:number){
  return Number((0.55*recency + 0.45*freq).toFixed(3));
}

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, windowDays = 365 } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error: "orgId required" }), { status: 400 });

    const since = new Date(Date.now() - windowDays*24*3600*1000).toISOString();

    // Pull contacts in org
    const { data: contacts } = await admin.from("contacts").select("id, email, company_id").eq("org_id", orgId).limit(50000);

    // Map email -> contact
    const emailToContact = new Map<string,string>();
    for (const c of (contacts||[])){
      const e = (c.email||"").toLowerCase();
      if (e) emailToContact.set(e, c.id);
    }

    // Activities: derive edges contact<->company by mentions
    const { data: acts } = await admin.from("activities").select("verb, meta, created_at").eq("org_id", orgId).gte("created_at", since).limit(50000);
    const compEdge = new Map<string, { count:number; last:string }>(); // key = contactId|companyId
    for (const a of (acts||[])){
      const s = JSON.stringify(a.meta||{}).toLowerCase();
      const emails = Array.from(emailToContact.keys()).filter(e=> s.includes(e)).slice(0,5);
      const companies = (s.match(/[a-z0-9.-]+\.(com|io|ai|net|co)/g)||[]).slice(0,5); // crude domain hints
      for (const em of emails){
        const cid = emailToContact.get(em)!;
        for (const d of companies){
          const key = cid + "|" + d;
          const prev = compEdge.get(key) || { count:0, last: a.created_at };
          prev.count += 1;
          if (!prev.last || new Date(a.created_at) > new Date(prev.last)) prev.last = a.created_at;
          compEdge.set(key, prev);
        }
      }
    }

    // Events: attendees -> company_id linkage
    const { data: evts } = await admin.from("events").select("company_id, attendees, starts_at").eq("org_id", orgId).gte("starts_at", since).limit(50000);
    for (const e of (evts||[])){
      const attendees = (e.attendees||[]) as any[];
      for (const a of attendees){
        const em = (a.email||"").toLowerCase();
        const cid = emailToContact.get(em);
        if (cid && e.company_id){
          const key = cid + "|" + e.company_id;
          const prev = compEdge.get(key) || { count:0, last: e.starts_at };
          prev.count += 1;
          if (!prev.last || new Date(e.starts_at) > new Date(prev.last)) prev.last = e.starts_at;
          compEdge.set(key, prev);
        }
      }
    }

    // Persist: upsert relationships per contact-company pair
    let upserts:any[] = [];
    for (const [key, val] of compEdge.entries()){
      const [contactId, compOrDomain] = key.split("|");
      let companyId = compOrDomain;

      // try to resolve domain to company_id if needed
      if (companyId && companyId.includes(".")){
        const { data: comp } = await admin.from("companies").select("id, domain").eq("org_id", orgId).eq("domain", companyId).maybeSingle();
        if (comp?.id) companyId = comp.id;
        else continue;
      }
      const rec = scoreRecency(val.last);
      const freq = scoreFrequency(val.count);
      const strength = combine(rec, freq);
      upserts.push({ org_id: orgId, from_contact: contactId, to_contact: null, company_id: companyId, recency_score: rec, frequency_score: freq, strength, last_interaction: val.last, source: "events/activities", updated_at: new Date().toISOString() });
      if (upserts.length >= 500){
        await admin.from("relationships").upsert(upserts, { onConflict: "org_id,from_contact,company_id" });
        upserts = [];
      }
    }
    if (upserts.length){
      await admin.from("relationships").upsert(upserts, { onConflict: "org_id,from_contact,company_id" });
    }

    return new Response(JSON.stringify({ ok:true, edges: compEdge.size }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
