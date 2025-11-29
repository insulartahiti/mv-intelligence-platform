import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });

function domainOf(email:string){ return email.split("@")[1]?.toLowerCase(); }

Deno.serve(async (req) => {
  try{
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status:401 });
    const { data: evts, error } = await admin.from("events").select("id,org_id,attendees,company_id").is("company_id", null).limit(500);
    if (error) throw error;
    let mapped=0;
    for (const e of evts||[]){
      const mails = (e.attendees||[]).map((a:any)=>a.email||"").filter(Boolean);
      let companyId=null;
      for (const m of mails){
        const dom = domainOf(m);
        if (!dom) continue;
        const { data: co } = await admin.from("companies").select("id").eq("org_id", e.org_id).ilike("domain", dom).maybeSingle();
        if (co?.id){ companyId=co.id; break; }
      }
      if (companyId){ await admin.from("events").update({ company_id: companyId }).eq("id", e.id); mapped++; }
    }
    return new Response(JSON.stringify({ ok:true, mapped }), { headers:{ "Content-Type":"application/json" } });
  }catch(e){ return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500 }); }
});
