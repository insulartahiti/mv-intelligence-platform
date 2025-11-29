import { adminClient } from "../_shared/util.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

async function embedQuery(q: string){
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method:"POST",
    headers:{ "content-type":"application/json", "authorization":`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model:"text-embedding-3-small", input:[q] })
  });
  if (!r.ok){ throw new Error(await r.text()); }
  const j = await r.json();
  return j.data[0].embedding;
}

Deno.serve(async (req) => {
  try{
    const admin = adminClient();
    const { q } = await req.json();
    if (!q) return new Response(JSON.stringify({ ok:false, error:"q required" }), { status: 400 });
    const embed = await embedQuery(q);

    const { data: rows, error } = await admin.rpc("hybrid_chunk_search", { q_embed: embed, q_text: q });
    if (error){
      const { data: chunks } = await admin.from("chunks").select("id as chunk_id,text,artifact_id").limit(20);
      return new Response(JSON.stringify({ ok:true, results: chunks||[], note:"fallback" }));
    }
    return new Response(JSON.stringify({ ok:true, results: rows }), { headers: { "content-type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
