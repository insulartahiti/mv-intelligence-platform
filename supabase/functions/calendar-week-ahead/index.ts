
import { requireUser } from "../_shared/auth.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

async function llm(content: string) {
  if (!OPENAI_API_KEY) return content;
  const rsp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content }] })
  });
  const json = await rsp.json();
  if (!rsp.ok) throw new Error(json?.error?.message || rsp.statusText);
  return json.choices[0].message.content;
}

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;

  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data: events } = await supabase.from("events").select("*").gte("starts_at", now.toISOString()).lte("starts_at", week.toISOString()).order("starts_at");

  let text = "Prepare me for the following meetings:\n\n" + (events||[]).map(e => `- ${e.title} (${e.starts_at}) at ${e.location || 'n/a'}`).join("\n");
  const prep = await llm(text + "\n\nFor each, suggest 2-3 questions and 1 action item.");

  return new Response(JSON.stringify({ events, prep }), { headers: { "Content-Type": "application/json" } });
});
