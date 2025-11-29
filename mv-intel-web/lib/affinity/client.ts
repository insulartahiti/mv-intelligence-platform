import { createClient } from '@supabase/supabase-js';

// Types for Affinity API responses
interface AffinityEntity {
  id: number;
  name: string;
  domain?: string;
  type: number; // 0 = person, 1 = organization
}

interface AffinityNote {
  id: number;
  content: string;
  creator_id: number;
  mention_ids: number[];
  posted_at: string;
  updated_at: string;
}

interface AffinityListEntry {
  id: number;
  entity_id: number;
  entity: AffinityEntity;
  // Custom fields would be mapped here dynamically
}

export class AffinityClient {
  private apiKey: string;
  private baseUrl = 'https://api.affinity.co';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Simple rate limiting could be added here
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + this.apiKey).toString('base64')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Basic retry logic for rate limits
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        console.warn(`Rate limited by Affinity. Retrying after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this.request<T>(path, options);
      }
      throw new Error(`Affinity API Error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getLists() {
    return this.request<any[]>('/lists');
  }

  async getListEntries(listId: number, pageToken?: string) {
    const params = new URLSearchParams({ page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    // Correct type based on debug output: it returns an object with 'list_entries' array
    return this.request<{ list_entries: AffinityListEntry[], next_page_token: string | null }>(`/lists/${listId}/list-entries?${params}`);
  }

  // Fetch notes for a specific entity (person or organization)
  // Affinity notes are attached to entities
  async getNotes(entityType: 'person' | 'organization', entityId: number) {
    return this.request<{ notes: AffinityNote[], next_page_token: string | null }>(`/notes?${entityType}_id=${entityId}`);
  }
  
  // Incremental sync logic would go here (fetching since timestamp not directly supported by all endpoints, 
  // often need to iterate lists or use webhooks)
}

