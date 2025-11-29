import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AFFINITY_API_KEY = Deno.env.get("AFFINITY_API_KEY");
const AFFINITY_BASE_URL = Deno.env.get("AFFINITY_BASE_URL") || "https://api.affinity.co";
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function authHeaders(){
  if(!AFFINITY_API_KEY) return {};
  const token = btoa(`:${AFFINITY_API_KEY}`);
  return { Authorization: `Basic ${token}` };
}

async function fetchOpps(affOrgId: number){
  if (!AFFINITY_API_KEY) return [];
  const url = new URL(`${AFFINITY_BASE_URL}/opportunities`);
  url.searchParams.set("organization_id", String(affOrgId));
  const r = await fetch(url.toString(), { headers: { ...authHeaders() } });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = Array.isArray(j.opportunities) ? j.opportunities : (j.opportunities ?? j);
  return Array.isArray(arr) ? arr.map((o:any)=>({ id:o.id, name:o.name, stage: o?.opportunity_stage?.name || o?.stage?.name || null })) : [];
}

Deno.serve(async (req) => {
  try{
    // optional manual auth
    if (WEBHOOK_SECRET && req.method === "POST") {
      const sig = req.headers.get("x-mv-signature");
      if (sig !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    }

    // Iterate companies with affinity_org_id
    const { data: comps, error } = await admin.from("companies").select("id, org_id, affinity_org_id").not("affinity_org_id", "is", null).limit(2000);
    if (error) throw error;

    let updated = 0;
    for (const c of comps || []){
      const opps = await fetchOpps(c.affinity_org_id);
      await admin.from("company_opportunities_cache").upsert({ company_id: c.id, data: opps, refreshed_at: new Date().toISOString() });
      updated++;
      // modest pacing
      await new Promise(res=>setTimeout(res, 150));
    }

    return new Response(JSON.stringify({ ok:true, companies: (comps||[]).length, updated }), { headers: { "Content-Type": "application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
