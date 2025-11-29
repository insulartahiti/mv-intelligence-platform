import { requireUser } from "../_shared/auth.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
const BUCKET = "deck-assets";
Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;
  const { artifactId } = await req.json();
  if (!artifactId) return new Response(JSON.stringify({ error:{ message:"artifactId required"}}), { status:400 });
  const { data: art } = await supabase.from("artifacts").select("id, org_id").eq("id", artifactId).single();
  if (!art || art.org_id !== org_id) return new Response("Forbidden", { status: 403 });
  const { data: slides, error } = await supabase.from("slides").select("slide_index, storage_path, width_px, height_px").eq("artifact_id", artifactId).order("slide_index");
  if (error) return new Response(JSON.stringify({ error:{ message: error.message }}), { status: 400 });
  if (!slides || slides.length === 0) return new Response(JSON.stringify({ error:{ message: "No slides"}}), { status: 400 });
  const pdfDoc = await PDFDocument.create();
  for (const s of slides) {
    const path = s.storage_path.startsWith(BUCKET + "/") ? s.storage_path.slice(BUCKET.length + 1) : s.storage_path;
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let img, w = s.width_px || 1280, h = s.height_px || 720;
    try { img = await pdfDoc.embedPng(bytes); w = img.width; h = img.height; }
    catch { try { img = await pdfDoc.embedJpg(bytes); w = img.width; h = img.height; } catch { continue; } }
    const page = pdfDoc.addPage([w, h]); page.drawImage(img, { x:0, y:0, width:w, height:h });
  }
  const pdfBytes = await pdfDoc.save();
  const pdfPath = `deck-pdf/${artifactId}.pdf`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return new Response(JSON.stringify({ error:{ message: upErr.message }}), { status: 400 });
  await supabase.from("artifacts").update({ status: "READY", slide_count: slides.length, pdf_path: `${BUCKET}/${pdfPath}` }).eq("id", artifactId);
  return new Response(JSON.stringify({ path: `${BUCKET}/${pdfPath}`, slideCount: slides.length }), { headers: { "Content-Type": "application/json" } });
});