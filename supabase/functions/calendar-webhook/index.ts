
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;
  const body = await req.json();

  // Accept array or single event
  const arr = Array.isArray(body) ? body : [body];
  for (const ev of arr) {
    await supabase.from("events").insert({
      org_id,
      title: ev.title,
      description: ev.description ?? null,
      location: ev.location ?? null,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at ?? null,
      attendees: ev.attendees ?? null,
      source: ev.source ?? "webhook"
    });
  }
  return new Response(JSON.stringify({ ok: true, inserted: arr.length }), { headers: { "Content-Type": "application/json" } });
});
