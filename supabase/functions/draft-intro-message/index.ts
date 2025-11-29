import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");
const NOTIFY_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/notify-slack";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, teammateId, targetContactId, companyId, channel } = await req.json();
    if (!orgId || !teammateId || (!targetContactId && !companyId)) return new Response(JSON.stringify({ ok:false, error:"orgId, teammateId, and targetContactId or companyId required" }), { status: 400 });

    const { data: teammate } = await admin.from("contacts").select("id,name,title,email").eq("id", teammateId).single();
    let target: any = null;
    if (targetContactId){
      const { data } = await admin.from("contacts").select("id,name,title,email,company_id").eq("id", targetContactId).single();
      target = data;
    }
    let company: any = null;
    if (companyId){
      const { data } = await admin.from("companies").select("id,name,domain,description").eq("id", companyId).single();
      company = data;
    }

    const sys = "Write concise, professional intro-request messages suitable for Slack or email. Keep to 80-120 words.";
    const usr = `You are Harsh at Motive Ventures. Draft a message asking ${teammate?.name||'a teammate'} to intro you to ${target?.name||('an exec at '+(company?.name||'the company'))}.
Context:
Teammate: ${teammate?.name||''} (${teammate?.title||''})
Target: ${target?.name||''} ${target?.title?(' - '+target.title):''} ${target?.email||''}
Company: ${company?.name||''} ${company?.domain||''} ${company?.description||''}

Tone: warm, direct, one or two crisp reasons for the intro, 2-3 suggested times if known, and room for the teammate to decline politely.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.4, messages:[ { role:"system", content:sys }, { role:"user", content:usr } ] })
    });
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || "";

    // Optional: post to Slack channel for one-click copy
    if (channel){
      await fetch(NOTIFY_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-mv-signature": WEBHOOK_SECRET || "" },
        body: JSON.stringify({ channel, text: "Intro request draft", blocks: [{ type:"section", text:{ type:"mrkdwn", text } }] })
      });
    }

    return new Response(JSON.stringify({ ok:true, text }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
