import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ input: text, model: "text-embedding-3-large" }),
  });
  const json = await res.json();
  return json.data[0].embedding;
}

function chunk(text: string, size = 1000, overlap = 150) {
  const out: string[] = []; let i = 0;
  while (i < text.length) { out.push(text.slice(i, i + size)); i += size - overlap; }
  return out;
}

async function summarizeDeck(text: string) {
  const prompt = `You are a venture investor. Summarize the deck text into: Product, Market, Traction/KPIs, Business Model, Team, Risks, Questions.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: prompt }, { role: "user", content: text.slice(0, 12000) }] }),
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

function extractKPIs(text: string) {
  const kpis: any[] = [];
  function num(s: string | undefined) { if (!s) return null; const m = /([\d,.]+)\s*([mbkMBK])?/.exec(s); if (!m) return null; const n = parseFloat(m[1].replace(/,/g,'')); const mult = m[2]?.toLowerCase()==='b'?1e9: m[2]?.toLowerCase()==='m'?1e6: m[2]?.toLowerCase()==='k'?1e3:1; return n*mult; }
  const arr = /\bARR\b[^\d$%]*([$€£]?\s*[\d,.]+\s*[mbkMBK]?)/i.exec(text); if (arr) kpis.push({ name:"ARR", value: num(arr[1]) });
  const mrr = /\bMRR\b[^\d$%]*([$€£]?\s*[\d,.]+\s*[mbkMBK]?)/i.exec(text); if (mrr) kpis.push({ name:"MRR", value: num(mrr[1]) });
  const churn = /\bchurn\b[^\d%]*([\d.]+\s*%)/i.exec(text); if (churn) kpis.push({ name:"Churn", value: parseFloat(churn[1]) });
  return kpis;
}

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET) {
      const auth = req.headers.get("x-mv-signature");
      if (auth !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    }
    const { artifactId, slides, pdfUrl, pushAffinity, affinity } = await req.json();

    // 1) OCR each slide (server-side cheap fallback using OpenAI Vision only to keep function light)
    let allText = "";
    for (const s of (slides || [])) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: "Extract exactly the text on the slide. No paraphrasing." },
                     { role: "user", content: [{ type: "text", text: "OCR this image" }, { type: "image_url", image_url: { url: s.imageUrl } }]}],
          temperature: 0
        }),
      });
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content?.trim() || "";
      allText += `\n\n[Slide ${s.slide_index}]\n${text}`;
    }

    // 2) Update slides with OCR text
    for (const s of (slides || [])) {
      await supabase.from("slides").update({ text_content: s.text_content }).eq("artifact_id", artifactId).eq("slide_number", s.slide_index);
    }

    // 3) Summary + KPIs
    const summary = await summarizeDeck(allText);
    const kpis = extractKPIs(allText);
    await supabase.from("artifacts").update({ 
      summary: { text: summary, kpis: kpis }, 
      pdf_path: pdfUrl,
      status: 'COMPLETED'
    }).eq("id", artifactId);

    // 4) Optional Affinity push (simplified - just log for now)
    if (pushAffinity && affinity?.company) {
      console.log('Affinity push requested for:', affinity.company);
      // TODO: Implement Affinity integration when needed
    }

    return new Response(JSON.stringify({ ok: true, slides: slides?.length || 0, kpis: kpis.length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
