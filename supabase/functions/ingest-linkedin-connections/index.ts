import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

/**
 * Payload example:
 * {
 *   "orgId":"...",
 *   "connections":[
 *     { "contact": { "email":"alice@acme.com","name":"Alice","linkedin_url":"https://linkedin.com/in/alice" },
 *       "other":   { "email":"bob@contoso.com","name":"Bob","linkedin_url":"https://linkedin.com/in/bob" },
 *       "degree": 2, "weight": 1.0 }
 *   ]
 * }
 */
Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const p = await req.json();
    const orgId = p.orgId;
    const rows = Array.isArray(p.connections) ? p.connections : [];
    if (!orgId || rows.length===0) return new Response(JSON.stringify({ ok:false, error:"orgId and connections required" }), { status: 400 });

    function normEmail(x:string){ return (x||"").trim().toLowerCase(); }

    // Ensure contacts exist
    async function upsertContact(spec:any){
      const email = normEmail(spec.email||"");
      const name = spec.name || email || "Unknown";
      let contactId: string | null = null;
      if (email){
        const { data: c0 } = await admin.from("contacts").select("id").eq("org_id", orgId).eq("email", email).maybeSingle();
        if (c0?.id) contactId = c0.id;
      }
      if (!contactId){
        const { data: c1 } = await admin.from("contacts").insert({ org_id: orgId, name, email: email || null, linkedin_url: spec.linkedin_url||null }).select("id").single();
        contactId = c1.id;
      } else {
        await admin.from("contacts").update({ name, linkedin_url: spec.linkedin_url||null }).eq("id", contactId);
      }
      return contactId!;
    }

    let inserted = 0;
    for (const row of rows){
      const a = await upsertContact(row.contact||{});
      const b = await upsertContact(row.other||{});
      await admin.from("contact_connections").upsert({
        org_id: orgId, contact_id: a, other_contact_id: b, degree: row.degree||null, source: "linkedin", weight: row.weight||1
      });
      // symmetric edge
      await admin.from("contact_connections").upsert({
        org_id: orgId, contact_id: b, other_contact_id: a, degree: row.degree||null, source: "linkedin", weight: row.weight||1
      });
      inserted++;
      await new Promise(res=>setTimeout(res, 10));
    }

    return new Response(JSON.stringify({ ok:true, inserted }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
