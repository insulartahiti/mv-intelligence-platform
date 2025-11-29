import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

async function embed(text: string){
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ input: text, model: "text-embedding-3-large" })
  });
  const j = await r.json(); return j.data?.[0]?.embedding;
}

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, q, limit = 20 } = await req.json();
    if (!orgId || !q) return new Response(JSON.stringify({ ok:false, error:"orgId and q required" }), { status: 400 });

    const e = await embed(q);

    // 1) semantic match on contacts via embeddings table (joined by contact_id)
    const { data: matches } = await admin.rpc("match_embeddings_contacts", { p_org_id: orgId, p_query_embedding: e, p_match_count: Math.min(limit*3, 60) }).catch(()=>({ data: [] }));
    // Fallback if RPC absent: naive by tags/name/title
    let fallback:any[] = [];
    if (!matches || matches.length===0){
      const { data: fc } = await admin.from("contacts").select("id,name,title,tags,company_id,last_interaction_at").eq("org_id", orgId).limit(200);
      fallback = (fc||[]).filter(c=> (c.tags||[]).join(" ").toLowerCase().includes(q.toLowerCase()) || (c.title||'').toLowerCase().includes(q.toLowerCase()) || (c.name||'').toLowerCase().includes(q.toLowerCase()));
    }

    const candidateIds = (matches||[]).map((m:any)=>m.contact_id).filter(Boolean);
    const { data: rels } = await admin.from("relationships").select("from_contact,company_id,strength,recency_score,frequency_score,last_interaction").eq("org_id", orgId).in("from_contact", candidateIds.length?candidateIds:['00000000-0000-0000-0000-000000000000']);
    const { data: contacts } = await admin.from("contacts").select("id,name,title,email,company_id,tags,last_interaction_at").eq("org_id", orgId).in("id", candidateIds.length?candidateIds:['00000000-0000-0000-0000-000000000000']);

    const relByContact = new Map<string, any[]>();
    for (const r of (rels||[])){
      const arr = relByContact.get(r.from_contact) || [];
      arr.push(r);
      relByContact.set(r.from_contact, arr);
    }

    const results:any[] = [];
    for (const m of (matches||[])){
      const c = (contacts||[]).find(x=>x.id===m.contact_id);
      if (!c) continue;
      const rel = relByContact.get(c.id) || [];
      const maxStrength = rel.reduce((acc, r)=> Math.max(acc, r.strength||0), 0);
      const score = 0.6*(m.similarity||0) + 0.4*maxStrength;
      results.push({ contact: c, score, similarity: m.similarity||0, relationship_strength: maxStrength });
    }

    if (results.length===0){
      for (const c of fallback){
        results.push({ contact: c, score: 0.35, similarity: 0.2, relationship_strength: 0.15 });
      }
    }

    results.sort((a,b)=> b.score - a.score);
    const top = results.slice(0, limit);

    // Join company names
    const compIds = Array.from(new Set(top.map(t=>t.contact.company_id).filter(Boolean)));
    let compMap = new Map<string,string>();
    if (compIds.length){
      const { data: comps } = await admin.from("companies").select("id,name").in("id", compIds);
      for (const c of (comps||[])) compMap.set(c.id, c.name);
    }

    const payload = top.map(t=> ({
      id: t.contact.id,
      name: t.contact.name,
      title: t.contact.title,
      email: t.contact.email,
      company: t.contact.company_id ? (compMap.get(t.contact.company_id) || null) : null,
      tags: t.contact.tags || [],
      last_interaction_at: t.contact.last_interaction_at,
      score: Number(t.score.toFixed(3)),
      similarity: Number((t.similarity||0).toFixed(3)),
      relationship_strength: Number((t.relationship_strength||0).toFixed(3))
    }));

    return new Response(JSON.stringify({ ok:true, results: payload }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
