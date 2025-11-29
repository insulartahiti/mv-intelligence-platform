import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/**
 * Expect Zapier/Calendar payload like:
 * {
 *   "orgId": "...",
 *   "source": "google" | "outlook",
 *   "externalId": "evt_123",
 *   "title": "Meeting with ACME",
 *   "description": "...",
 *   "location": "Zoom ...",
 *   "startsAt": "2025-09-01T15:00:00Z",
 *   "endsAt": "2025-09-01T16:00:00Z",
 *   "attendees": [{ "name":"Jane", "email":"jane@acme.com" }, ...]
 * }
 */
Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const p = await req.json();
    const orgId = p.orgId;
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    // upsert by (org_id, external_source, external_id)
    const { data: existing } = await admin.from("events").select("id").eq("org_id", orgId).eq("external_source", p.source).eq("external_id", p.externalId).maybeSingle();

    const row = {
      org_id: orgId,
      title: p.title,
      description: p.description || null,
      location: p.location || null,
      starts_at: p.startsAt,
      ends_at: p.endsAt || null,
      attendees: p.attendees || [],
      external_source: p.source,
      external_id: p.externalId
    };

    if (existing?.id) {
      await admin.from("events").update(row).eq("id", existing.id);
      return new Response(JSON.stringify({ ok:true, id: existing.id, updated: true }), { headers: { "Content-Type":"application/json" } });
    } else {
      const { data, error } = await admin.from("events").insert(row).select("id").single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok:true, id: data.id, created: true }), { headers: { "Content-Type":"application/json" } });
    }
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
