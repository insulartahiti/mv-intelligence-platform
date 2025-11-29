import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url = Deno.env.get("SUPABASE_URL")!;
const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, svc, { auth: { persistSession: false } });

function freshnessBoost(lastSeen: string | null, halfLifeDays=90){
  if (!lastSeen) return 0.7;
  const now = Date.now();
  const t = new Date(lastSeen).getTime();
  const days = Math.max(0, (now - t) / (1000*3600*24));
  return Math.exp(-days/halfLifeDays);
}

Deno.serve(async (req) => {
  try{
    const { sourceContactId, targetCompanyId, k=5 } = await req.json();
    if (!sourceContactId || !targetCompanyId)
      return new Response(JSON.stringify({ ok:false, error:"sourceContactId and targetCompanyId required" }), { status: 400 });

    const { data: links } = await admin.from("contact_company_link").select("contact_id, confidence, last_seen_at").eq("company_id", targetCompanyId);
    const targetSet = new Set((links||[]).map(l=>l.contact_id));

    const { data: edges } = await admin.from("edges_contact_contact")
      .select("a,b,weight,last_seen_at").or(`a.eq.${sourceContactId},b.eq.${sourceContactId}`);

    const neighbors = new Map<string, { weight:number, last_seen_at:string|null }>();
    for (const e of (edges||[])){
      const other = e.a === sourceContactId ? e.b : e.a;
      neighbors.set(other, { weight: Number(e.weight||0), last_seen_at: e.last_seen_at||null });
    }

    const paths:any[] = [];
    for (const cand of (links||[])){
      const nb = neighbors.get(cand.contact_id);
      if (!nb) continue;
      const freshness = freshnessBoost(nb.last_seen_at);
      const score = (nb.weight||0) * Number(cand.confidence||0.7) * freshness;
      paths.push({ hops:[sourceContactId, cand.contact_id], score });
    }

    const topNeighbors = Array.from(neighbors.entries()).sort((a,b)=> (b[1].weight||0) - (a[1].weight||0)).slice(0, 50);
    for (const [mid, w1] of topNeighbors){
      const { data: edges2 } = await admin.from("edges_contact_contact").select("a,b,weight,last_seen_at").or(`a.eq.${mid},b.eq.${mid}`);
      for (const e of (edges2||[])){
        const other = e.a === mid ? e.b : e.a;
        if (!targetSet.has(other)) continue;
        const edge2w = Number(e.weight||0);
        const freshness = Math.min(freshnessBoost(w1.last_seen_at), freshnessBoost(e.last_seen_at));
        const link = (links||[]).find(l=>l.contact_id===other);
        const score = Math.min(Number(w1.weight||0), edge2w) * Number(link?.confidence||0.7) * freshness;
        paths.push({ hops:[sourceContactId, mid, other], score });
      }
    }

    paths.sort((a,b)=> b.score - a.score);
    const top = paths.slice(0, k);
    const ids = Array.from(new Set(top.flatMap(p=>p.hops.slice(1))));
    const { data: cs } = await admin.from("contacts").select("id,full_name,primary_email,title,linkedin_url").in("id", ids||[]);
    const cmap = new Map<string, any>((cs||[]).map(c => [c.id, c]));
    const out = top.map(p => ({ score: p.score, hops: p.hops.map((id:string)=>cmap.get(id)||{id}) }));
    return new Response(JSON.stringify({ ok:true, paths: out }), { headers: { "content-type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
