import { createClient } from '@supabase/supabase-js';

// Types for Affinity API responses
interface AffinityEntity {
  id: number;
  name: string;
  domain?: string;
  type: number; // 0 = person, 1 = organization
  global?: boolean;
}

interface AffinityNote {
  id: number;
  content: string;
  creator_id: number;
  mention_ids: number[];
  posted_at: string;
  updated_at: string;
}

interface AffinityEmail {
  id: number;
  subject: string;
  body: string; // HTML content often
  sent_at: string;
  sender_id: number; // Affinity person ID
  recipient_ids: number[];
}

interface AffinityMeeting {
  id: number;
  type: number; // 0 = meeting, 1 = call
  start_time: string;
  end_time: string | null;
  attendees: {
    attendee_id: number;
    attendee_type: number; // 0 = person, 1 = organization
  }[];
  title: string | null; // Often null if not manually set
}

interface AffinityReminder {
  id: number;
  content: string;
  owner_id: number;
  completed: boolean;
  due_date: string;
  created_at: string;
}

export interface AffinityFile {
  id: number;
  name: string;
  size: number;
  organization_id?: number;
  person_id?: number;
  opportunity_id?: number;
  uploader_id: number;
  created_at: string;
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
  async getNotes(entityType: 'person' | 'organization', entityId: number) {
    return this.request<{ notes: AffinityNote[], next_page_token: string | null }>(`/notes?${entityType}_id=${entityId}`);
  }

  // Fetch emails
  async getEmails(entityType: 'person' | 'organization', entityId: number) {
    // Note: Affinity API for emails might be /emails?person_id=... or /persons/{id}/emails depending on version. 
    // Standard v1 is /emails?person_id=...
    return this.request<{ emails: AffinityEmail[], next_page_token: string | null }>(`/emails?${entityType}_id=${entityId}`);
  }

  // Fetch meetings
  async getMeetings(entityType: 'person' | 'organization', entityId: number) {
    return this.request<{ meetings: AffinityMeeting[], next_page_token: string | null }>(`/meetings?${entityType}_id=${entityId}`);
  }

  // Fetch reminders
  async getReminders(entityType: 'person' | 'organization', entityId: number) {
    return this.request<{ reminders: AffinityReminder[], next_page_token: string | null }>(`/reminders?${entityType}_id=${entityId}`);
  }

  // Fetch files
  async getFiles(entityType: 'person' | 'organization', entityId: number) {
    return this.request<{ entity_files: AffinityFile[], next_page_token: string | null }>(`/entity-files?${entityType}_id=${entityId}`);
  }

  // Get download URL for a file (returns 302 redirect usually, but we might just store the link construction)
  getDownloadUrl(fileId: number): string {
    return `${this.baseUrl}/entity-files/download/${fileId}`;
  }

  // Fetch field values for a list entry
  async getFieldValues(listEntryId: number) {
    return this.request<any[]>(`/field-values?list_entry_id=${listEntryId}`);
  }

  // Fetch single person details
  async getPerson(personId: number) {
    const p = await this.request<any>(`/persons/${personId}`);
    // Normalize name
    if (!p.name && (p.first_name || p.last_name)) {
        p.name = [p.first_name, p.last_name].filter(Boolean).join(' ');
    }
    return p as AffinityEntity;
  }

  // Fetch organization details (includes person_ids)
  async getOrganization(orgId: number) {
    return this.request<any>(`/organizations/${orgId}`);
  }
}
