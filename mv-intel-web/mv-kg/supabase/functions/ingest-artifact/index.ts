import { adminClient, splitTextIntoChunks } from "../_shared/util.ts";

Deno.serve(async (req) => {
  try{
    const admin = adminClient();
    const body = await req.json();
    const { source_type, source_url, external_id, title, raw_text, metadata } = body || {};
    if (!source_type) return new Response(JSON.stringify({ ok:false, error:"source_type required" }), { status: 400 });

    const { data: art, error: aerr } = await admin.from("artifacts").upsert({
      source_type, source_url: source_url||null, external_id: external_id||null,
      title: title||null, raw_text: raw_text||null, metadata: metadata||{}
    }, { onConflict: "source_type,external_id" }).select("id, raw_text").single();
    if (aerr) throw aerr;

    let createdChunks = 0;
    if (raw_text){
      const parts = splitTextIntoChunks(raw_text);
      for (let idx=0; idx<parts.length; idx++){
        const t = parts[idx];
        const { error: cerr } = await admin.from("chunks").upsert({ artifact_id: art.id, idx, text: t }, { onConflict: "artifact_id,idx" });
        if (cerr) throw cerr;
        createdChunks++;
      }
    }

    return new Response(JSON.stringify({ ok:true, artifact_id: art.id, chunks_created: createdChunks }), { headers: { "content-type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
