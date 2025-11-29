import { adminClient } from "../_shared/util.ts";

Deno.serve(async () => {
  try{
    const admin = adminClient();
    const { data: batch } = await admin.from("chunks").select("id").is("enriched_at", null).not("embedding","is",null).limit(16);
    if (!batch || batch.length === 0) return new Response(JSON.stringify({ ok:true, processed:0, done:true }));

    let ok=0, fail=0;
    for (const c of batch){
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-chunk`, {
        method:"POST",
        headers:{ "Authorization":`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type":"application/json" },
        body: JSON.stringify({ chunk_id: c.id })
      });
      if (r.ok) ok++; else fail++;
      await new Promise(res=>setTimeout(res, 200));
    }
    return new Response(JSON.stringify({ ok:true, processed: ok, failed: fail }));
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
