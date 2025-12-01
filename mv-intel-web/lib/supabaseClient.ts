import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | undefined;

export function makeBrowserClient() {
  if (browserClient) return browserClient;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build time or when env vars are missing
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOtp: async () => ({ error: { message: 'Missing Supabase credentials' } }),
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        delete: () => ({ eq: () => ({ error: null }) }),
      }),
    } as any;
  }
  
  browserClient = createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

export function makeServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build time or when env vars are missing
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
    } as any;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
}
