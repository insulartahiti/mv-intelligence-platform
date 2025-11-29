import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

function degreeWeight(deg?: number|null){
  if (deg === 1) return 1.0;
  if (deg === 2) return 0.6;
  if (deg === 3) return 0.3;
  return 0.2;
}

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, companyId, limit = 20 } = await req.json();
    if (!orgId || !companyId) return new Response(JSON.stringify({ ok:false, error:"orgId and companyId required" }), { status: 400 });

    // Team members
    const { data: team } = await admin.from("contacts").select("id,name,title,email").eq("org_id", orgId).eq("is_internal", true).limit(500);
    // External contacts with relationships into company
    const { data: rels } = await admin.from("relationships").select("from_contact, strength, recency_score, frequency_score, last_interaction").eq("org_id", orgId).eq("company_id", companyId).gt("strength", 0).limit(5000);
    const extIds = Array.from(new Set((rels||[]).map(r=>r.from_contact).filter(Boolean)));
    const { data: externals } = await admin.from("contacts").select("id,name,title,email,linkedin_url").eq("org_id", orgId).in("id", extIds.length?extIds:["00000000-0000-0000-0000-000000000000"]);

    // Build adjacency via contact_connections
    const teamIds = (team||[]).map(t=>t.id);
    const { data: edges } = await admin.from("contact_connections").select("contact_id, other_contact_id, degree, weight").eq("org_id", orgId).in("contact_id", teamIds.length?teamIds:["00000000-0000-0000-0000-000000000000"]).in("other_contact_id", extIds.length?extIds:["00000000-0000-0000-0000-000000000000"]).limit(20000);

    const relByExternal = new Map<string, any>();
    for (const r of (rels||[])) relByExternal.set(r.from_contact, r);

    const extMap = new Map<string, any>();
    for (const c of (externals||[])) extMap.set(c.id, c);

    const teamMap = new Map<string, any>();
    for (const t of (team||[])) teamMap.set(t.id, t);

    const paths:any[] = [];
    for (const e of (edges||[])){
      const teammate = teamMap.get(e.contact_id);
      const external = extMap.get(e.other_contact_id);
      const rel = relByExternal.get(e.other_contact_id);
      if (!teammate || !external || !rel) continue;
      const w = degreeWeight(e.degree) * (e.weight || 1);
      const score = 0.7*(rel.strength||0) + 0.3*w;
      paths.push({
        teammate, external, degree: e.degree||null, link_weight: e.weight||1, relationship: rel, score: Number(score.toFixed(3))
      });
    }

    // also include direct team→company relationships (no LI edge needed)
    const { data: teamRels } = await admin.from("relationships").select("from_contact,strength,recency_score,frequency_score,last_interaction").eq("org_id", orgId).eq("company_id", companyId).in("from_contact", teamIds.length?teamIds:["00000000-0000-0000-0000-000000000000"]);
    for (const tr of (teamRels||[])){
      const teammate = teamMap.get(tr.from_contact);
      if (!teammate) continue;
      const score = tr.strength || 0;
      paths.push({ teammate, external: null, degree: 0, link_weight: 1, relationship: tr, score: Number(score.toFixed(3)) });
    }

    // Deduplicate by teammate, keep best
    const bestByTeammate = new Map<string, any>();
    for (const p of paths){
      const k = p.teammate.id;
      const prev = bestByTeammate.get(k);
      if (!prev || p.score > prev.score) bestByTeammate.set(k, p);
    }

    const out = Array.from(bestByTeammate.values()).sort((a,b)=> b.score - a.score).slice(0, limit);
    return new Response(JSON.stringify({ ok:true, companyId, paths: out }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
