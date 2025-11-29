import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AFFINITY_API_KEY = Deno.env.get("AFFINITY_API_KEY");
const AFFINITY_BASE_URL = Deno.env.get("AFFINITY_BASE_URL") || "https://api.affinity.co";

function basicAuthHeaders(){
  if(!AFFINITY_API_KEY) return {};
  const token = btoa(`:${AFFINITY_API_KEY}`);
  return { Authorization: `Basic ${token}` };
}

Deno.serve(async (_req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { data: comps, error } = await admin.from('companies').select('id,org_id,name,affinity_org_id').not('affinity_org_id','is',null).limit(100);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results:any[] = [];
  for (const c of comps||[]){
    try{
      const url = new URL(`${AFFINITY_BASE_URL}/opportunities`);
      url.searchParams.set('organization_id', String(c.affinity_org_id));
      const r = await fetch(url.toString(), { headers: { ...basicAuthHeaders() } });
      if (!r.ok) continue;
      const j = await r.json();
      const arr = Array.isArray(j.opportunities) ? j.opportunities : (j.opportunities??[]);
      const mapped = arr.map((o:any)=>({ id:o.id, name:o.name, stage:o?.opportunity_stage?.name||o?.stage?.name||null }));
      await admin.from('activities').insert({ org_id:c.org_id, artifact_id:null, verb:'affinity_opps_snapshot', meta:{ company_id:c.id, opportunities:mapped } });
      results.push({ company:c.name, opps:mapped.length });
    }catch(e){}
  }
  return new Response(JSON.stringify({ ok:true, processed: results.length, results }), { headers:{ 'Content-Type':'application/json' } });
});
