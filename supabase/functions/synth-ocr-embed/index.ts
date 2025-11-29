
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Tesseract from "https://esm.sh/tesseract.js@5.1.0";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const BUCKET = "deck-assets";

async function embedText(text: string) {
  if (!OPENAI_API_KEY) return null;
  const rsp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-large", input: text })
  });
  const json = await rsp.json();
  if (!rsp.ok) throw new Error(json?.error?.message || rsp.statusText);
  return json.data[0].embedding;
}

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;

  const { artifactId } = await req.json();
  if (!artifactId) return new Response(JSON.stringify({ error: { message: "artifactId required" }}), { status: 400 });

  const { data: slides, error } = await supabase.from("slides").select("slide_index, storage_path").eq("artifact_id", artifactId).order("slide_index");
  if (error) return new Response(JSON.stringify({ error: { message: error.message }}), { status: 400 });
  if (!slides || slides.length === 0) return new Response(JSON.stringify({ error: { message: "No slides" }}), { status: 404 });

  let fullText = "";
  for (const s of slides) {
    const path = s.storage_path.startsWith(BUCKET+"/") ? s.storage_path.slice(BUCKET.length+1) : s.storage_path;
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !blob) continue;
    const ab = await blob.arrayBuffer();
    const { data: { text } } = await Tesseract.recognize(ab, 'eng', { logger: () => {} });
    const chunk = `Slide ${s.slide_index}:\n${text.trim()}`.slice(0, 8000);
    fullText += "\n\n" + chunk;
    try {
      const embedding = await embedText(chunk);
      if (embedding) {
        await supabase.from("embeddings").insert({ org_id, artifact_id: artifactId, chunk, vector: embedding });
      }
    } catch {}
  }
  // Store naive summary placeholder
  await supabase.from("artifacts").update({ summary_text: fullText.slice(0, 1200) }).eq("id", artifactId);

  return new Response(JSON.stringify({ ok: true, chars: fullText.length }), { headers: { "Content-Type": "application/json" } });
});
