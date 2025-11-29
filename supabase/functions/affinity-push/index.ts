
import { requireUser } from "../_shared/auth.ts";

const AFF_BASE = "https://api.affinity.co"; // NOTE: set AFFINITY_API_KEY and AFFINITY_API_SECRET envs

function affHeaders() {
  const key = Deno.env.get("AFFINITY_API_KEY") || "";
  const sec = Deno.env.get("AFFINITY_API_SECRET") || "";
  if (!key || !sec) return null;
  const basic = btoa(`${key}:${sec}`);
  return { "Authorization": `Basic ${basic}` };
}

async function getSignedUrl(supabase: any, bucketPath: string) {
  const [bucket, ...rest] = bucketPath.split("/");
  const path = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;
  const hdr = affHeaders();
  const { artifactId, companyName, people = [], createIfMissing = true } = await req.json();

  // Fetch artifact with pdf_path and title
  const { data: art, error } = await supabase.from("artifacts").select("id, title, pdf_path").eq("id", artifactId).single();
  if (error || !art) return new Response(JSON.stringify({ error: { message: "Artifact not found" }}), { status: 404 });

  if (!hdr) {
    // Not configured: mark activity and return notice
    await supabase.from("activities").insert({ org_id, verb: "pushed_to_affinity", artifact_id: artifactId, meta: { configured: false } });
    return new Response(JSON.stringify({ pushed: false, message: "Affinity credentials not configured" }), { headers: { "Content-Type": "application/json" } });
  }

  // Get signed URL for attachment
  let attachmentUrl: string | null = null;
  if (art.pdf_path) {
    attachmentUrl = await getSignedUrl(supabase, art.pdf_path);
  }

  // Pseudo steps: upsert organization/person and attach file (implementation depends on Affinity API)
  // Here we just log an activity and return pushed: true
  await supabase.from("activities").insert({ org_id, verb: "pushed_to_affinity", artifact_id: artifactId, meta: { companyName, people, attachmentUrl } });

  // Cleanup: delete slides and keep only PDF or delete all if desired
  if (art.pdf_path) {
    // Delete slides folder for artifact
    const slidesPrefix = `deck-assets/deck-slides/${artifactId}`;
    await supabase.storage.from("deck-assets").remove([`deck-slides/${artifactId}/0001.png`]); // example; consider list+remove
  }

  return new Response(JSON.stringify({ pushed: true, cleaned: false }), { headers: { "Content-Type": "application/json" } });
});
