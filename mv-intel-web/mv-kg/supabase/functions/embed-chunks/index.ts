import { adminClient } from "../_shared/util.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async () => {
  try{
    const admin = adminClient();
    const { data: batch } = await admin.from("chunks").select("id,text").is("embedding", null).limit(64);
    if (!batch || batch.length === 0) return new Response(JSON.stringify({ ok:true, count:0, done:true }));

    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map(b=>b.text) })
    });
    if (!resp.ok){ const t=await resp.text(); throw new Error(`OpenAI ${resp.status}: ${t}`); }
    const json = await resp.json();
    const vectors = json.data.map((d:any)=>d.embedding);
    for (let i=0;i<batch.length;i++){
      await admin.from("chunks").update({ embedding: vectors[i] }).eq("id", batch[i].id);
    }
    return new Response(JSON.stringify({ ok:true, count: batch.length }));
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
