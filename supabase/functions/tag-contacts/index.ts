import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

async function tag(text: string){
  const sys = "You label fintech expertise concisely. Return 3-6 short comma-separated tags like 'RIA connectivity, Wealth infra, Payments partnerships'.";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model:"gpt-4o-mini", temperature:0, messages:[{ role:"system", content:sys }, { role:"user", content:text.slice(0,4000) }] })
  });
  const j = await r.json();
  const out = (j.choices?.[0]?.message?.content||"").split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean).slice(0,8);
  return out;
}

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, limit = 200 } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error: "orgId required" }), { status: 400 });

    const { data: contacts } = await admin.from("contacts").select("id,name,title,email,company_id,tags").eq("org_id", orgId).limit(limit);
    for (const c of (contacts||[])){
      // Build context from embeddings/news/metrics snippets mentioning this contact or their company
      let ctx = `${c.name} ${c.title||""} ${c.email||""}`;
      if (c.company_id){
        const { data: comp } = await admin.from("companies").select("name,domain,description").eq("id", c.company_id).maybeSingle();
        if (comp) ctx += `\nCompany: ${comp.name} ${comp.domain||""} ${comp.description||""}`;
      }
      const tags = await tag(ctx);
      await admin.from("contacts").update({ tags }).eq("id", c.id);
      await new Promise(res=>setTimeout(res, 150));
    }

    return new Response(JSON.stringify({ ok:true, tagged: (contacts||[]).length }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
