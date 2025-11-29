import { adminClient, safeJsonExtract } from "../_shared/util.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  try{
    const admin = adminClient();
    const { chunk_id } = await req.json();
    if (!chunk_id) return new Response(JSON.stringify({ ok:false, error:"chunk_id required" }), { status: 400 });

    const { data: chunk } = await admin.from("chunks").select("id,text,artifact_id").eq("id", chunk_id).single();
    if (!chunk) return new Response(JSON.stringify({ ok:false, error:"chunk not found" }), { status: 404 });

    const sys = `Extract entities and relations from text. Return JSON: {entities:[], relations:[]}. Entities: {kind, name, aliases?}. Relations: {subj, pred, obj, weight?, props?}.`;
    const user = `TEXT:\n\n${chunk.text}\n`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        temperature:0.2,
        response_format:{ type:"json_object" },
        messages:[{role:"system", content:sys}, {role:"user", content:user}]
      })
    });
    if (!resp.ok){ const t=await resp.text(); throw new Error(`OpenAI ${resp.status}: ${t}`); }
    const out = await resp.json();
    const raw = out.choices?.[0]?.message?.content || "{}";
    const parsed = safeJsonExtract(raw);
    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    const relations = Array.isArray(parsed.relations) ? parsed.relations : [];

    const nameToId = new Map<string,string>();
    for (const e of entities){
      const kind = String(e.kind||"").toLowerCase();
      const name = String(e.name||"").trim();
      if (!kind || !name) continue;
      const { data: existing } = await admin.from("entities").select("id").eq("kind", kind).ilike("canonical_name", name).maybeSingle();
      let eid = existing?.id;
      if (!eid){
        const ins = await admin.from("entities").insert({ kind, canonical_name: name, aliases: e.aliases||[] }).select("id").single();
        eid = ins.data.id;
      }
      nameToId.set(name, eid!);
      await admin.from("mentions").insert({ chunk_id: chunk.id, entity_id: eid, span: null, confidence: 0.8 });
      await admin.from("entities").update({ last_seen_at: new Date().toISOString() }).eq("id", eid);
    }

    for (const r of relations){
      const sId = nameToId.get(r.subj);
      const oId = nameToId.get(r.obj);
      const pred = String(r.pred||"").toLowerCase();
      if (!sId || !oId || !pred) continue;
      const weight = typeof r.weight === "number" ? r.weight : 0.5;
      const { data: rel } = await admin.from("relations").upsert({
        subj: sId, pred, obj: oId, weight, last_seen_at: new Date().toISOString(), first_seen_at: new Date().toISOString(), props: r.props||{}
      }, { onConflict: "subj,pred,obj" }).select("id,evidence").single();
      const evidence = Array.isArray(rel?.evidence) ? rel!.evidence : [];
      evidence.push({ chunk_id: chunk.id });
      await admin.from("relations").update({ evidence }).eq("id", rel!.id);
    }

    await admin.from("chunks").update({ enriched_at: new Date().toISOString() }).eq("id", chunk.id);
    return new Response(JSON.stringify({ ok:true, entities: nameToId.size, relations: relations.length }), { headers: { "content-type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
