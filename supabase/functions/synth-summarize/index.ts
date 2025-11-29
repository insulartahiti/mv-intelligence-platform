
import { requireUser } from "../_shared/auth.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

async function summarize(text: string, mode: string) {
  if (!OPENAI_API_KEY) return `Summary (${mode}):\n` + text.slice(0, 600);
  const prompt = `Summarize the following ${mode} content for a venture investor. Provide bullets: product, traction/KPIs, business model, team, risks, open questions.\n\n` + text.slice(0, 10000);
  const rsp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] })
  });
  const json = await rsp.json();
  if (!rsp.ok) throw new Error(json?.error?.message || rsp.statusText);
  return json.choices[0].message.content;
}

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase } = check;

  const { artifactId, mode = "deck" } = await req.json();
  if (!artifactId) return new Response(JSON.stringify({ error: { message: "artifactId required" }}), { status: 400 });

  // Read chunks if present; fallback to summary_text or empty
  const { data: chunks } = await supabase.from("embeddings").select("chunk").eq("artifact_id", artifactId).limit(50);
  let text = (chunks || []).map(c => c.chunk).join("\n\n");
  if (!text) {
    const { data: art } = await supabase.from("artifacts").select("summary_text").eq("id", artifactId).single();
    text = art?.summary_text || "";
  }
  const summary = await summarize(text || "No text available", mode);

  await supabase.from("activities").insert({ org_id: check.org_id, verb: "summary_generated", artifact_id: artifactId, meta: { mode } });
  await supabase.from("artifacts").update({ summary_text: summary.slice(0, 4000) }).eq("id", artifactId);

  return new Response(JSON.stringify({ summary, citations: [] }), { headers: { "Content-Type": "application/json" } });
});
