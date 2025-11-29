
import { requireUser } from "../_shared/auth.ts";
const BUCKET = "deck-assets";

Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;
  const { artifactId, deletePdf = false } = await req.json();

  const { data: art, error: artErr } = await supabase.from("artifacts").select("id, pdf_path").eq("id", artifactId).single();
  if (artErr || !art) return new Response(JSON.stringify({ error: { message: "Artifact not found" }}), { status: 404 });

  // List and remove slides for artifact
  const prefix = `deck-slides/${artifactId}`;
  const { data: list, error: listErr } = await supabase.storage.from(BUCKET).list(prefix);
  if (!listErr && list && list.length > 0) {
    const paths = list.map((f: any) => `${prefix}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }

  if (deletePdf && art.pdf_path?.startsWith(`${BUCKET}/`)) {
    const pdf = art.pdf_path.slice(`${BUCKET}/`.length);
    await supabase.storage.from(BUCKET).remove([pdf]);
    await supabase.from("artifacts").update({ pdf_path: null }).eq("id", artifactId);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
