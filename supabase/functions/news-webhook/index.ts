
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;
  const arr = await req.json();
  const items = Array.isArray(arr) ? arr : [arr];
  for (const n of items) {
    await supabase.from("news_items").insert({
      org_id,
      source: n.source ?? null,
      url: n.url ?? null,
      title: n.title ?? null,
      content: n.content ?? null,
      published_at: n.published_at ?? null,
      companies: n.companies ?? null
    });
  }
  return new Response(JSON.stringify({ ok: true, inserted: items.length }), { headers: { "Content-Type": "application/json" } });
});
