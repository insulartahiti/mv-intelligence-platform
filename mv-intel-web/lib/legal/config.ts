
import { createClient } from '@supabase/supabase-js';

// Define the keys we support
export type LegalConfigKey = 
  | 'legal_analysis_system_prompt'
  | 'semantic_normalization'
  | 'economics_prompt'
  | 'governance_prompt'
  | 'legal_gc_prompt'
  | 'standalone_prompt';

// Cache structure
interface CacheEntry {
  content: string;
  timestamp: number;
}

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const cache: Record<string, CacheEntry> = {};

// Supabase client for server-side usage
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Fetch a legal configuration value.
 * Uses DB if available, otherwise returns undefined (caller should use fallback).
 */
export async function getLegalConfig(key: LegalConfigKey): Promise<string | null> {
  // Check cache
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('legal_config')
      .select('content')
      .eq('key', key)
      .single();

    if (error || !data) return null;

    // Update cache
    cache[key] = { content: data.content, timestamp: Date.now() };
    return data.content;
  } catch (e) {
    console.error(`Failed to fetch legal config for ${key}`, e);
    return null;
  }
}

/**
 * Update a legal configuration value.
 */
export async function updateLegalConfig(key: LegalConfigKey, content: string, description?: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('legal_config')
      .upsert({
        key,
        content,
        description,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    // Update cache
    cache[key] = { content, timestamp: Date.now() };
    return true;
  } catch (e) {
    console.error(`Failed to update legal config for ${key}`, e);
    return false;
  }
}

