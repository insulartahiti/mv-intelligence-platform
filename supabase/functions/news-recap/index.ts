
import { requireUser } from "../_shared/auth.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

async function llm(prompt: string) {
  if (!OPENAI_API_KEY) return prompt;
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
  const { supabase, org_id } = check;

  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: items } = await supabase.from("news_items").select("title,content,source,companies,published_at,url").gte("published_at", since).order("published_at", { ascending: false }).limit(100);

  const prompt = `Create a fintech news recap for a VC team. Group by topic/company and call out items relevant to Motive portfolio companies.\n\nArticles:\n` + (items||[]).map((i:any) => `- ${i.title} (${i.source}) [${i.published_at}] ${i.content?.slice(0,300)||''}`).join("\n");
  const recap = await llm(prompt);
  return new Response(JSON.stringify({ recap, count: items?.length || 0 }), { headers: { "Content-Type": "application/json" } });
});
