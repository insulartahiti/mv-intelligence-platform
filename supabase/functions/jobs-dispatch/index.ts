
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, user, org_id } = check;

  const { kind, payload } = await req.json();
  if (!kind) return new Response(JSON.stringify({ error: { message: "kind required" }}), { status: 400 });

  const ins = {
    org_id: org_id ?? (payload?.org_id ?? null),
    kind,
    status: "queued",
    payload,
    created_by: user.id
  };
  const { data, error } = await supabase.from("jobs").insert(ins).select("id, status").single();
  if (error) return new Response(JSON.stringify({ error: { message: error.message }}), { status: 400 });
  return new Response(JSON.stringify({ id: data.id, status: data.status }), { headers: { "Content-Type": "application/json" } });
});
