import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");
const AFFINITY_API_KEY = Deno.env.get("AFFINITY_API_KEY");
const AFFINITY_BASE_URL = Deno.env.get("AFFINITY_BASE_URL") || "https://api.affinity.co";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

function bucketStrength(x:number){
  if (x >= 0.65) return "Hot";
  if (x >= 0.35) return "Warm";
  return "Cool";
}

async function affinityRequest(path:string, method:string, body?:any){
  if (!AFFINITY_API_KEY) throw new Error("No AFFINITY_API_KEY set");
  const r = await fetch(`${AFFINITY_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type":"application/json", "Authorization": `Basic ${btoa(AFFINITY_API_KEY + ":")}` },
    body: body? JSON.stringify(body) : undefined
  });
  if (!r.ok){
    const t = await r.text();
    throw new Error(`Affinity error ${r.status}: ${t}`);
  }
  return r.json();
}

Deno.serve( async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
    const { orgId, limit = 500 } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ ok:false, error:"orgId required" }), { status: 400 });

    // Fetch contacts with tags and relationship strengths
    const { data: contacts } = await admin.from("contacts").select("id,name,email,tags,affinity_person_id").eq("org_id", orgId).limit(limit);
    // Relationship maxima by contact
    const { data: rels } = await admin.from("relationships").select("from_contact,strength").eq("org_id", orgId).limit(50000);
    const maxByContact = new Map<string, number>();
    for (const r of (rels||[])){
      const prev = maxByContact.get(r.from_contact) || 0;
      if ((r.strength||0) > prev) maxByContact.set(r.from_contact, r.strength||0);
    }

    let updated = 0;
    for (const c of (contacts||[])){
      const heat = bucketStrength(maxByContact.get(c.id)||0);
      const tagStr = (c.tags||[]).join(", ");
      // Map to Affinity custom fields (IDs would be configured; using placeholder names)
      if (c.affinity_person_id){
        await affinityRequest(`/v1/people/${c.affinity_person_id}`, "PUT", {
          custom_fields: [
            { name: "MV Tags", value: tagStr },
            { name: "MV Relationship", value: heat }
          ]
        });
        updated++;
      }
      await new Promise(res=>setTimeout(res, 100)); // modest rate-limit
    }

    return new Response(JSON.stringify({ ok:true, updated }), { headers: { "Content-Type":"application/json" } });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
}); 
