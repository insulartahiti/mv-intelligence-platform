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
    const { orgId, companyId, opportunityId, templateKey = "mv_memo_template", template } = await req.json();
    if (!orgId || !companyId) return new Response(JSON.stringify({ ok:false, error:"orgId and companyId required" }), { status: 400 });

    let tmpl = template;
    if (!tmpl){
      const { data: t } = await admin.from("templates").select("content").eq("key", templateKey).maybeSingle();
      tmpl = t?.content || "# MV Memo\n";
    }

    // Company basic
    const { data: comp } = await admin.from("companies").select("id,name,domain,description").eq("id", companyId).maybeSingle();

    // Context: recent metrics, news, embeddings chunks
    const { data: mets } = await admin.from("metrics").select("name,value,unit,period,created_at").eq("org_id", orgId).eq("company_id", companyId).order("created_at", { ascending:false }).limit(200);
    const metLines = (mets||[]).slice(0,40).map(m => `${m.name}: ${m.value}${m.unit?(' '+m.unit):''} ${m.period?('('+m.period+')'):''}`).join("\n");

    const { data: news } = await admin.rpc("news_for_company_detailed", { p_company_id: companyId });
    const newsLines = (news||[]).slice(0,12).map((n:any)=> `[${n.published_at||''}] ${n.title||n.url} (${n.source||''})`).join("\n");

    const q = [comp?.name||'', comp?.description||'', metLines].join(" ");
    const e = await embed(q);
    const { data: chunks } = await admin.rpc("match_embeddings", { p_org_id: orgId, p_query_embedding: e, p_match_count: 20 }).catch(()=>({ data: [] }));
    const chunkText = (chunks||[]).map((c:any)=> c.content).join("\n");

    const sys = `You are an expert Motive Ventures investor with deep expertise in fintech, enterprise software, and venture capital. Your role is to create comprehensive, investment-grade memos that follow Motive Ventures' rigorous standards.

Key principles:
- Use the template headings exactly as provided
- Write with precision, clarity, and investment-grade analysis
- Include specific data points, metrics, and evidence
- Maintain professional tone with actionable insights
- Focus on defensible investment theses
- Include relevant market context and competitive positioning
- Highlight key risks and mitigation strategies
- Use bullet points and tables for clarity
- Always include dates and sources for data
- Ensure all claims are substantiated with evidence

Template structure must be followed precisely. Fill in all sections with high-quality, investment-focused content.`;

    const usr = `INVESTMENT MEMO GENERATION REQUEST

TEMPLATE TO POPULATE:
${tmpl}

COMPANY INFORMATION:
- Name: ${comp?.name || 'Unknown'}
- Domain: ${comp?.domain || 'N/A'}
- Description: ${comp?.description || 'No description available'}

FINANCIAL METRICS & KPIs:
${metLines || 'No metrics available'}

RECENT NEWS & UPDATES:
${newsLines || 'No recent news available'}

ADDITIONAL INTELLIGENCE CONTEXT:
${chunkText || 'No additional context available'}

INSTRUCTIONS:
1. Populate the template with comprehensive, investment-grade analysis
2. Use all available data to inform your analysis
3. Maintain the exact heading structure from the template
4. Include specific metrics, dates, and evidence where available
5. Write with the sophistication expected by Motive Ventures partners
6. Ensure the memo is ready for investment committee review
7. Use markdown formatting for tables, lists, and emphasis
8. Include confidence levels or data quality notes where appropriate

Generate a complete investment memo following the template structure.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ 
        model:"gpt-5", 
        temperature:0.1, 
        max_tokens:8000,
        messages:[ 
          { role:"system", content:sys }, 
          { role:"user", content:usr } 
        ] 
      })
    });
    const j = await r.json();
    const markdown = j.choices?.[0]?.message?.content || tmpl;

    // Upsert deal_memo row
    const { data: existing } = await admin.from("deal_memos").select("id").eq("org_id", orgId).eq("company_id", companyId).maybeSingle();
    if (existing?.id){
      await admin.from("deal_memos").update({ markdown, last_drafted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", existing.id);
      return new Response(JSON.stringify({ ok:true, id: existing.id, markdown }), { headers:{ "Content-Type":"application/json" } });
    } else {
      const { data: ins } = await admin.from("deal_memos").insert({ org_id: orgId, company_id: companyId, opportunity_id: opportunityId||null, title: (comp?.name || 'Deal Memo'), markdown, last_drafted_at: new Date().toISOString() }).select("id").single();
      return new Response(JSON.stringify({ ok:true, id: ins.id, markdown }), { headers:{ "Content-Type":"application/json" } });
    }
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
