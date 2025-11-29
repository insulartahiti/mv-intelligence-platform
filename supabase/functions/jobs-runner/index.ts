
import { requireUser } from "../_shared/auth.ts";

// This runner is meant for a cron job using the service role. It processes a small batch.
Deno.serve(async (req) => {
  // Allow either user JWT or service role (no JWT). If no JWT, run as system.
  const auth = await requireUser(req);
  const supabase = "error" in auth ? (await (await import("../_shared/supabase.ts")).serverClient()) : auth.supabase;
  const org_id = "error" in auth ? null : auth.org_id;
  const system = "error" in auth;

  // fetch queued jobs; if system, process all; else only org-scoped
  let q = supabase.from("jobs").select("id, org_id, kind, payload, status").eq("status","queued").order("created_at").limit(5);
  if (!system && org_id) q = q.eq("org_id", org_id);
  const { data: jobs, error } = await q;
  if (error) return new Response(JSON.stringify({ error: { message: error.message }}), { status: 400 });
  const results: any[] = [];

  for (const job of jobs || []) {
    const start = Date.now();
    await supabase.from("jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      let result: any = null;
      if (job.kind === "synth") {
        const rsp = await callFn(supabase, "/functions/v1/synth-summarize", { artifactId: job.payload?.artifactId, mode: job.payload?.mode || "deck" }, job.org_id);
        result = { summarize: rsp };
      } else if (job.kind === "kpi") {
        const rsp = await callFn(supabase, "/functions/v1/synth-extract-kpis", { artifactId: job.payload?.artifactId, hints: job.payload?.hints || {} }, job.org_id);
        result = { kpis: rsp };
      } else if (job.kind === "affinity_push") {
        const rsp = await callFn(supabase, "/functions/v1/affinity-push", { artifactId: job.payload?.artifactId, createIfMissing: true }, job.org_id);
        result = { push: rsp };
      } else if (job.kind === "cleanup") {
        const rsp = await callFn(supabase, "/functions/v1/artifact-cleanup", { artifactId: job.payload?.artifactId }, job.org_id);
        result = { cleanup: rsp };
      } else {
        result = { message: "unknown kind" };
      }
      await supabase.from("jobs").update({ status:"done", result, updated_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, ok: true, ms: Date.now() - start });
    } catch (e) {
      await supabase.from("jobs").update({ status:"error", result: { error: String(e) }, updated_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { "Content-Type": "application/json" } });
});

async function callFn(supabase: any, path: string, body: any, org_id: string | null) {
  // Generate a short-lived JWT for org scope using service role auth.admin.createJwt
  const { data: jwtData, error: jwtErr } = await supabase.auth.admin.generateLink({ type: "magiclink", email: "system@mvintel.local" });
  if (jwtErr) throw new Error(jwtErr.message);
  // In absence of a direct createJwt, fall back to calling function without user JWT (Edge functions can allow service role only).
  const url = (Deno.env.get("SUPABASE_URL") || "") + path;
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || res.statusText);
  return json;
}
