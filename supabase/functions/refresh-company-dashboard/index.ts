import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, companyIds } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    // Companies to process: watchlist if none specified
    let companies: any[] = [];
    if (Array.isArray(companyIds) && companyIds.length){
      const { data } = await admin.from("companies").select("id").eq("org_id", orgId).in("id", companyIds);
      companies = data||[];
    } else {
      const { data } = await admin.from("company_watchlist").select("company_id").eq("org_id", orgId).limit(500);
      companies = (data||[]).map((x:any)=>({ id: x.company_id }));
    }
    const today = new Date().toISOString().slice(0,10);

    for (const c of companies){
      // Latest metrics (canonical names)
      const { data: mets } = await admin.from("metrics")
        .select("name,value,unit,period,created_at")
        .eq("org_id", orgId).eq("company_id", c.id)
        .order("created_at", { ascending:false }).limit(200);

      const canon = ["ARR","MRR","Revenue","NRR","Churn","Cash","Runway"];
      const latest:any = {};
      for (const m of (mets||[])){
        const key = (m.name||"").toUpperCase();
        if (canon.includes(key) && latest[key] == null) latest[key] = m.value;
      }

      // News last 30 days
      const since = new Date(Date.now()-30*24*3600*1000).toISOString();
      const { data: news } = await admin.rpc("news_for_company_detailed", { p_company_id: c.id });
      const n30 = (news||[]).filter((n:any)=> n.published_at && n.published_at >= since).length;

      // Open actions
      const { data: acts } = await admin.from("actions").select("id").eq("org_id", orgId).eq("status","OPEN").eq("related_company", c.id);
      const openCount = (acts||[]).length;

      await admin.from("company_snapshots").upsert({
        org_id: orgId, company_id: c.id, as_of: today, metrics: latest, news_30d: n30, actions_open: openCount, updated_at: new Date().toISOString()
      }, { onConflict: "org_id,company_id,as_of" });
    }

    return new Response(JSON.stringify({ ok:true, processed: companies.length }), { headers:{ "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
