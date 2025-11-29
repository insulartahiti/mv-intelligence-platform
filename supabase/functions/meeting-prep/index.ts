import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");
const NOTIFY_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/notify-slack";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Req = {
  orgId: string;
  from?: string; // ISO
  to?: string;   // ISO
  channel?: string; // slack channel override
  sendSlack?: boolean;
};

async function embed(text: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ input: text, model:"text-embedding-3-large" })
  });
  const j = await r.json(); return j.data?.[0]?.embedding;
}

async function summarize(context: string, evt: any){
  const sys = "You are an elite venture investor preparing for meetings. Write concise, actionable briefs.";
  const usr = `Meeting: ${evt.title}
When: ${evt.starts_at} ${evt.location?`@ ${evt.location}`:""}
Attendees: ${(evt.attendees||[]).map((a:any)=>a.name||a.email).join(", ")}

Context:
${context}

Write:
1) Who they are / what they do
2) Why this is relevant for Motive Ventures
3) Recent developments to mention (with dates)
4) Key questions to ask (5-8 bullets)
5) Action items (bullets)
Short, crisp sentences. Avoid fluff.`;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.2, messages:[ {role:"system", content:sys}, {role:"user", content:usr } ] })
  });
  const j = await r.json(); return j.choices?.[0]?.message?.content || "";
}

function dedupe<T>(arr: T[]): T[] {
  const s = new Set<string>(); const out: T[] = [];
  for (const x of arr) { const k = JSON.stringify(x).slice(0,512); if (!s.has(k)) { s.add(k); out.push(x); } }
  return out;
}

async function buildContext(orgId: string, evt: any){
  let text = "";

  // 1) If event linked to a company: pull news + metrics + embeddings chunks
  if (evt.company_id){
    // news (linked first)
    const { data: news } = await admin.rpc("news_for_company_detailed", { p_company_id: evt.company_id });
    for (const n of (news||[]).slice(0,8)){
      text += `\n[News ${n.published_at||""}] ${n.title||""} - ${n.source||""} ${n.url||""}`;
    }
    // metrics
    const { data: mets } = await admin.from("metrics").select("name,value,unit,period").eq("org_id", orgId).eq("company_id", evt.company_id).order("created_at", { ascending:false }).limit(20);
    for (const m of (mets||[])){
      text += `\n[Metric] ${m.name}: ${m.value}${m.unit?(" "+m.unit):""} ${m.period?("("+m.period+")"):""}`;
    }
    // embeddings: fetch top chunks matching event title + attendees
    const query = [evt.title, ...(evt.attendees||[]).map((a:any)=>a.name || a.email || "")].filter(Boolean).join(" ");
    if (query){
      const e = await embed(query);
      const { data: chunks } = await admin.rpc("match_embeddings", { p_org_id: orgId, p_query_embedding: e, p_match_count: 12 });
      for (const c of (chunks||[])) text += `\n[Context] ${c.content}`;
    }
  } else {
    // No company mapping: still try embeddings on title/attendees
    const query = [evt.title, ...(evt.attendees||[]).map((a:any)=>a.name || a.email || "")].filter(Boolean).join(" ");
    if (query){
      const e = await embed(query);
      const { data: chunks } = await admin.rpc("match_embeddings", { p_org_id: orgId, p_query_embedding: e, p_match_count: 12 });
      for (const c of (chunks||[])) text += `\n[Context] ${c.content}`;
    }
  }

  // 2) Last artifacts/activities mentioning attendee emails
  const mails = (evt.attendees||[]).map((a:any)=> (a.email||"").toLowerCase()).filter(Boolean);
  if (mails.length){
    const { data: acts } = await admin.from("activities").select("verb,meta,created_at").eq("org_id", orgId).order("created_at", { ascending:false }).limit(50);
    for (const a of (acts||[])){
      const s = JSON.stringify(a.meta||{}).toLowerCase();
      if (mails.some(m=>s.includes(m))) text += `\n[Activity ${a.created_at}] ${a.verb}: ${s.slice(0,200)}`;
    }
  }

  return text.trim();
}

async function slackSend(channel: string|undefined, title: string, brief: string, link?: string){
  try{
    const blocks = [
      { type:"section", text:{ type:"mrkdwn", text: `*Week Ahead — ${title}*${link?`\n${link}`:""}` } },
      { type:"section", text:{ type:"mrkdwn", text: brief.slice(0,2800) } }
    ];
    await fetch(NOTIFY_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-mv-signature": WEBHOOK_SECRET || "" },
      body: JSON.stringify({ channel, text:`Week Ahead: ${title}`, blocks })
    });
  } catch {}
}

Deno.serve( async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const body = await req.json() as Req;
    const orgId = body.orgId;
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    const from = body.from ? new Date(body.from) : new Date();
    const to = body.to ? new Date(body.to) : new Date(Date.now() + 7*24*3600*1000);

    const { data: evts, error } = await admin.from("events")
      .select("id,title,description,location,attendees,starts_at,ends_at,company_id")
      .eq("org_id", orgId)
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at");
    if (error) throw error;

    const briefs: any[] = [];
    for (const e of (evts||[])){
      const ctx = await buildContext(orgId, e);
      const brief = await summarize(ctx, e);
      briefs.push({ event: e, brief });
      if (body.sendSlack) await slackSend(body.channel, e.title, brief);
      // small pacing
      await new Promise(res=>setTimeout(res, 200));
    }

    return new Response(JSON.stringify({ ok:true, count: briefs.length, briefs }), { headers: { "Content-Type":"application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
