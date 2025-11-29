import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

const LABELS = ["Milestone","Risk","Competitor","Hiring","Reg/Legal","Customer"];

async function classify(item: any){
  const sys = "Classify fintech-related items into one label: Milestone, Risk, Competitor, Hiring, Reg/Legal, or Customer. Return JSON {label, title, date}.";
  const text = `${item.title||item.url||""}\n${item.summary||item.content||""}`.slice(0,4000);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model:"gpt-4o-mini", temperature:0, messages:[ { role:"system", content:sys }, { role:"user", content:text } ] })
  });
  const j = await r.json();
  try{
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}");
    let label = parsed.label;
    if (!LABELS.includes(label)) label = "Milestone";
    return { label, title: parsed.title || item.title || "", date: parsed.date || item.published_at || null };
  }catch{
    return { label:"Milestone", title: item.title||"", date: item.published_at||null };
  }
}

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, companyId, days = 90, limit = 40 } = await req.json();
    if (!orgId || !companyId) return new Response(JSON.stringify({ ok:false, error:"orgId and companyId required" }), { status: 400 });

    const since = new Date(Date.now()-days*24*3600*1000).toISOString();

    // Pull candidate items: news + embeddings chunks marked as 'news' or 'update', and recent actions (optional)
    const { data: news } = await admin.rpc("news_for_company_detailed", { p_company_id: companyId });
    const items = (news||[]).filter((n:any)=> n.published_at && n.published_at >= since).slice(0, limit);

    let inserted = 0;
    for (const it of items){
      const cls = await classify(it);
      await admin.from("company_signals").insert({
        org_id: orgId, company_id: companyId, type: cls.label, title: cls.title || it.title || it.url, details: it.summary || null, date: cls.date? new Date(cls.date).toISOString().slice(0,10) : null,
        evidence: [{ type:"news", id: it.id||null, url: it.url||null, published_at: it.published_at||null }]
      });
      inserted++;
      await new Promise(res=>setTimeout(res, 150));
    }

    return new Response(JSON.stringify({ ok:true, inserted }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
