import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function makeBrowserClient() {
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
