
import { requireUser } from "../_shared/auth.ts";
function parseNumber(s: string): number | null {
  if (!s) return null;
  const mult = /b/i.test(s) ? 1e9 : /m/i.test(s) ? 1e6 : /k/i.test(s) ? 1e3 : 1;
  const num = parseFloat(s.replace(/[$,]/g,''));
  return isNaN(num) ? null : num * mult;
}
Deno.serve(async (req) => {
  const check = await requireUser(req);
  if ("error" in check) return check.error;
  const { supabase, org_id } = check;

  const { artifactId } = await req.json();
  const { data: chunks } = await supabase.from("embeddings").select("chunk").eq("artifact_id", artifactId).limit(50);
  const text = (chunks || []).map(c => c.chunk).join("\n\n");

  const kpis: any[] = [];
  const arrMatch = text.match(/ARR[^0-9$]*([$€£]?[0-9,.]+ ?[mbk]?)/i);
  if (arrMatch) kpis.push({ name: "ARR", value: parseNumber(arrMatch[1]), period: "TTM" });
  const mrrMatch = text.match(/MRR[^0-9$]*([$€£]?[0-9,.]+ ?[mbk]?)/i);
  if (mrrMatch) kpis.push({ name: "MRR", value: parseNumber(mrrMatch[1]), period: "Current" });
  const churnMatch = text.match(/churn[^0-9%]*([0-9.]+ ?%)/i);
  if (churnMatch) kpis.push({ name: "Churn", value: parseFloat(churnMatch[1]), period: "TTM", unit: "%" });

  for (const k of kpis) {
    await supabase.from("metrics").insert({ org_id, company_id: null, name: k.name, value: k.value, period: null, source_artifact: artifactId });
  }

  await supabase.from("activities").insert({ org_id, verb: "kpis_extracted", artifact_id: artifactId, meta: { count: kpis.length } });
  return new Response(JSON.stringify({ artifactId, kpis }), { headers: { "Content-Type": "application/json" } });
});
