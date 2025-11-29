
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AFFINITY_KEY = Deno.env.get("AFFINITY_API_KEY")!;
const AFFINITY_BASE = Deno.env.get("AFFINITY_BASE_URL") || "https://api.affinity.co";
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

type Payload = {
  orgId: string;
  artifactId: string;
  company: { name: string; domain?: string };
  contacts?: Array<{ firstName?: string; lastName?: string; email?: string }>;
  summary?: { keyPoints?: string[]; risks?: string[]; ask?: string };
  pdfUrl?: string;
  listId?: number;          // add org to list
  oppPipelineId?: number;   // optional: create opportunity in this pipeline
  oppStageId?: number;      // optional: initial stage id
  dedupeKey: string;        // idempotency token
};

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function basicAuthHeader() { const token = btoa(`:${AFFINITY_KEY}`); return { Authorization: `Basic ${token}` }; }

async function searchOrganization(term: string) {
  const url = new URL(`${AFFINITY_BASE}/organizations`); url.searchParams.set("term", term);
  const res = await fetch(url, { headers: basicAuthHeader() }); if (!res.ok) throw new Error(`Affinity org search failed: ${res.status}`);
  const data = await res.json(); return Array.isArray(data.organizations) ? data.organizations : data.organizations ?? data;
}
async function createOrganization(name: string, domain?: string) {
  const res = await fetch(`${AFFINITY_BASE}/organizations`, { method: "POST", headers: { "Content-Type": "application/json", ...basicAuthHeader() }, body: JSON.stringify({ name, domains: domain ? [domain] : [] }) });
  if (!res.ok) throw new Error(`Affinity create org failed: ${res.status}`); return res.json();
}
async function searchPerson(term: string) {
  const url = new URL(`${AFFINITY_BASE}/persons`); url.searchParams.set("term", term);
  const res = await fetch(url, { headers: basicAuthHeader() }); if (!res.ok) throw new Error(`Affinity person search failed: ${res.status}`);
  const data = await res.json(); return Array.isArray(data.persons) ? data.persons : data.persons ?? data;
}
async function createPerson(p: { first_name?: string; last_name?: string; emails?: string[]; organization_ids?: number[] }) {
  const res = await fetch(`${AFFINITY_BASE}/persons`, { method: "POST", headers: { "Content-Type": "application/json", ...basicAuthHeader() }, body: JSON.stringify(p) });
  if (!res.ok) throw new Error(`Affinity create person failed: ${res.status}`); return res.json();
}
async function addEntityToList(listId: number, entityId: number, entityType: number) {
  const res = await fetch(`${AFFINITY_BASE}/lists/${listId}/list-entries`, { method: "POST", headers: { "Content-Type": "application/json", ...basicAuthHeader() }, body: JSON.stringify({ entity_id: entityId, entity_type: entityType }) });
  if (!res.ok) throw new Error(`Affinity add to list failed: ${res.status}`); return res.json();
}
async function createNote(params: { content: string; organization_id?: number; person_id?: number }) {
  const res = await fetch(`${AFFINITY_BASE}/notes`, { method: "POST", headers: { "Content-Type": "application/json", ...basicAuthHeader() }, body: JSON.stringify(params) });
  if (!res.ok) throw new Error(`Affinity create note failed: ${res.status}`); return res.json();
}
async function createOpportunity(params: { name: string; organization_id: number; pipeline_id: number; opportunity_stage_id?: number }) {
  const res = await fetch(`${AFFINITY_BASE}/opportunities`, { method: "POST", headers: { "Content-Type": "application/json", ...basicAuthHeader() }, body: JSON.stringify(params) });
  if (!res.ok) throw new Error(`Affinity create opportunity failed: ${res.status}`); return res.json();
}
async function uploadFileToEntity(fileUrl: string, attach: { organization_id?: number; person_id?: number; opportunity_id?: number }) {
  const fileResp = await fetch(fileUrl); if (!fileResp.ok) throw new Error(`Fetch file failed: ${fileResp.status}`);
  const blob = await fileResp.blob();
  const form = new FormData();
  form.append("file", new File([blob], "mv-intel.pdf", { type: "application/pdf" }));
  if (attach.organization_id) form.append("organization_id", String(attach.organization_id));
  if (attach.person_id) form.append("person_id", String(attach.person_id));
  if (attach.opportunity_id) form.append("opportunity_id", String(attach.opportunity_id));
  const res = await fetch(`${AFFINITY_BASE}/entity-files`, { method: "POST", headers: { ...basicAuthHeader() }, body: form });
  if (!res.ok) throw new Error(`Affinity upload file failed: ${res.status}`); return res.json();
}

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const payload = await req.json() as Payload;

    const { data: artifact } = await supabaseAdmin.from("artifacts").select("id, affinity_push_status, affinity_external_ids").eq("id", payload.artifactId).single();
    if (artifact?.affinity_push_status === "PUSHED") return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

    // Upsert org
    const term = payload.company.domain || payload.company.name;
    const orgResults = await searchOrganization(term);
    let orgId: number | undefined = (Array.isArray(orgResults) && orgResults.length > 0) ? orgResults[0].id : undefined;
    if (!orgId) orgId = (await createOrganization(payload.company.name, payload.company.domain)).id;

    // Upsert contacts
    const personIds: number[] = [];
    for (const c of payload.contacts || []) {
      const searchTerm = c.email || `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const ps = await searchPerson(searchTerm);
      let pid: number | undefined = (Array.isArray(ps) && ps.length > 0) ? ps[0].id : undefined;
      if (!pid) pid = (await createPerson({ first_name: c.firstName, last_name: c.lastName, emails: c.email ? [c.email] : [], organization_ids: orgId ? [orgId] : [] })).id;
      if (pid) personIds.push(pid);
    }

    // Add org to list
    if (payload.listId && orgId) { try { await addEntityToList(payload.listId, orgId, 8); } catch {} }

    // Create opportunity if requested
    let opportunityId: number | undefined;
    if (payload.oppPipelineId && orgId) {
      const opp = await createOpportunity({ name: `${payload.company.name} — MV Intel`, organization_id: orgId, pipeline_id: payload.oppPipelineId, opportunity_stage_id: payload.oppStageId });
      opportunityId = opp.id;
    }

    // Note
    if (payload.summary && orgId) {
      const content = [
        `MV Intelligence Summary (dedupe=${payload.dedupeKey})`,
        payload.summary.keyPoints?.length ? `Key Points:\n- ${payload.summary.keyPoints.join("\n- ")}` : "",
        payload.summary.risks?.length ? `Risks:\n- ${payload.summary.risks.join("\n- ")}` : "",
        payload.summary.ask ? `Ask: ${payload.summary.ask}` : ""
      ].filter(Boolean).join("\n\n");
      await createNote({ content, organization_id: orgId });
    }

    // Upload PDF (to org or opp)
    if (payload.pdfUrl && (orgId || opportunityId)) {
      await uploadFileToEntity(payload.pdfUrl, { organization_id: orgId, opportunity_id: opportunityId });
    }

    // Mark pushed
    await supabaseAdmin.from("artifacts").update({ affinity_push_status: "PUSHED", affinity_external_ids: { organization_id: orgId, person_ids: personIds, opportunity_id: opportunityId } }).eq("id", payload.artifactId);

    return new Response(JSON.stringify({ ok: true, organization_id: orgId, person_ids: personIds, opportunity_id: opportunityId }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
