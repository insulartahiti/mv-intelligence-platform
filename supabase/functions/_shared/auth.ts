import { serverClient, getJWT } from "./supabase.ts";

export async function requireUser(req: Request) {
  const supabase = serverClient();
  const jwt = getJWT(req);
  if (!jwt) return { error: new Response("Unauthorized", { status: 401 }) };
  
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return { error: new Response("Unauthorized", { status: 401 }) };
  
  // SIMPLIFIED: No organization requirements
  return { supabase, user: data.user };
}
