import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");
const NOTIFY_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/notify-slack";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { orgId } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1).toISOString();

    const { data: due } = await admin.from("actions").select("title,details,due_at,status").eq("org_id", orgId).eq("status","OPEN").gte("due_at", start).lt("due_at", end).order("due_at");
    const { data: open } = await admin.from("actions").select("title,details,due_at,status").eq("org_id", orgId).eq("status","OPEN").is("due_at", null).limit(10);

    const lines: string[] = [];
    lines.push("*Today’s Actions*");
    for (const a of (due||[])) lines.push(`• ${a.title}${a.due_at?` (_due ${a.due_at}_)`:''}`);
    lines.push("", "*Open (no due date)*");
    for (const a of (open||[])) lines.push(`• ${a.title}`);

    await fetch(NOTIFY_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-mv-signature": WEBHOOK_SECRET || "" },
      body: JSON.stringify({ text: "Daily Actions", blocks: [{ type:"section", text:{ type:"mrkdwn", text: lines.join("\n") } }] })
    });

    return new Response(JSON.stringify({ ok:true, due: (due||[]).length, open:(open||[]).length }), { headers: { "Content-Type":"application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
