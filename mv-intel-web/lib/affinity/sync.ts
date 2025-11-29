import { AffinityClient } from './client';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { generateEmbedding } from '../search/postgres-vector'; // Re-use embedding function
import { enrichNoteWithAI } from '../enrichment/notes'; // New note enrichment

// Initialize Supabase client for direct DB operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Postgres Pool for direct DB operations (if needed for complex transactions)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export class AffinitySyncService {
    private affinityClient: AffinityClient;

    constructor(affinityApiKey: string) {
        this.affinityClient = new AffinityClient(affinityApiKey);
    }

    async getAffinityListId(listName: string): Promise<number | null> {
        const lists = await this.affinityClient.getLists();
        const targetList = lists.find((list: any) => list.name === listName);
        return targetList ? targetList.id : null;
    }

    async upsertEntity(entityData: any, type: 'person' | 'organization', rawEntry: any = {}): Promise<string> {
        // 1. Fetch existing entity to compare for history
        const { data: existing } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, pipeline_stage, valuation_amount')
            .eq(type === 'organization' ? 'affinity_org_id' : 'affinity_person_id', type === 'organization' ? entityData.id : entityData.id)
            .single();

        // 2. Prepare new data
        const newData: any = {
            affinity_org_id: type === 'organization' ? entityData.id : null,
            affinity_person_id: type === 'person' ? entityData.id : null,
            name: entityData.name,
            type: type,
            domain: entityData.domain || (entityData.domains && entityData.domains.length > 0 ? entityData.domains[0] : null),
            is_pipeline: true,
            source: 'affinity_sync',
            updated_at: new Date().toISOString(),
        };

        // Map Affinity Fields (Generic mapping, adjust based on actual list columns)
        // Note: In a real implementation, we'd map dynamic field IDs from Affinity.
        // For now, we assume rawEntry has mapped fields if available, or we trust the basic entity props.
        if (rawEntry.status) newData.pipeline_stage = rawEntry.status; // Example
        // valuation_amount would come from custom fields, ignored for now unless passed explicitly

        // 3. Upsert Entity
        const { data: upserted, error } = await supabase
            .schema('graph')
            .from('entities')
            .upsert(newData, { onConflict: type === 'organization' ? 'affinity_org_id' : 'affinity_person_id' })
            .select('id, pipeline_stage, valuation_amount') // Select potentially updated fields
            .single();

        if (error) {
            console.error(`Error upserting ${type} ${entityData.name}:`, error);
            throw error;
        }

        // 4. Track History (If changed)
        if (existing && upserted) {
            await this.trackHistory(upserted.id, 'pipeline_stage', existing.pipeline_stage, upserted.pipeline_stage);
            await this.trackHistory(upserted.id, 'valuation_amount', existing.valuation_amount, upserted.valuation_amount);
        }

        return upserted.id;
    }

    async trackHistory(entityId: string, field: string, oldValue: any, newValue: any) {
        // Normalize values for comparison
        const oldStr = String(oldValue || '');
        const newStr = String(newValue || '');

        if (oldStr !== newStr && (oldValue !== null || newValue !== null)) {
            console.log(`📜 History: ${field} changed from "${oldStr}" to "${newStr}" for ${entityId}`);
            await supabase
                .schema('graph')
                .from('history_log')
                .insert({
                    entity_id: entityId,
                    field_name: field,
                    old_value: oldStr,
                    new_value: newStr,
                    source: 'affinity_sync'
                });
        }
    }

    async upsertInteraction(interactionData: any): Promise<void> {
        const { error } = await supabase
            .schema('graph')
            .from('interactions')
            .upsert(interactionData, { onConflict: 'affinity_interaction_id' });

        if (error) {
            console.error(`Error upserting interaction ${interactionData.affinity_interaction_id}:`, error);
            throw error;
        }
    }

    async syncPipelineList(listName: string) {
        console.log(`🔄 Finding Affinity List: "${listName}"...`);
        const listId = await this.getAffinityListId(listName);

        if (!listId) {
            console.error(`❌ Affinity list "${listName}" not found.`);
            return;
        }

        console.log(`📋 Found List ID: ${listId}. Fetching entries...`);

        let pageToken: string | undefined = undefined;
        let companiesProcessed = 0;
        let companiesUpserted = 0;
        let notesProcessed = 0;
        let emailsProcessed = 0;
        let meetingsProcessed = 0;
        let remindersProcessed = 0;
        
        const errors: string[] = [];

        try {
            do {
                const response = await this.affinityClient.getListEntries(listId, pageToken);
                const entries = response.list_entries; 

                if (!entries || entries.length === 0) {
                    console.log('No more entries to fetch.');
                    break;
                }

                for (const entry of entries) {
                    const entityType = entry.entity_type === 1 ? 'organization' : 'person';
                    let entityDbId: string | null = null;

                    try {
                        // Pass 'entry' as rawEntry to extract status etc.
                        entityDbId = await this.upsertEntity(entry.entity, entityType, entry);
                        companiesUpserted++;
                    } catch (e: any) {
                        errors.push(`Failed to upsert entity ${entry.entity.name}: ${e.message}`);
                        continue;
                    }
                    companiesProcessed++;

                    // 1. NOTES
                    try {
                        const notesResponse = await this.affinityClient.getNotes(entityType, entry.entity_id);
                        for (const note of notesResponse.notes) {
                            notesProcessed++;
                            if (await this.isInteractionSynced(note.id)) continue;
                            
                            const enriched = await enrichNoteWithAI(note.content);
                            const embedding = await generateEmbedding(enriched.ai_summary || note.content);

                            await this.upsertInteraction({
                                affinity_interaction_id: note.id,
                                entity_id: entityDbId,
                                interaction_type: 'note',
                                subject: note.content.substring(0, 100),
                                content_full: note.content,
                                content_preview: enriched.ai_summary || note.content.substring(0, 250),
                                company_id: entityType === 'organization' ? entityDbId : null,
                                started_at: note.posted_at,
                                ended_at: note.updated_at,
                                ai_summary: enriched.ai_summary,
                                ai_sentiment: enriched.ai_sentiment,
                                ai_key_points: enriched.ai_key_points,
                                ai_action_items: enriched.ai_action_items,
                                ai_risk_flags: enriched.ai_risk_flags,
                                ai_themes: enriched.ai_themes,
                                embedding: embedding,
                            });
                        }
                    } catch (e: any) {
                        errors.push(`Failed notes for ${entry.entity.name}: ${e.message}`);
                    }

                    // 2. EMAILS
                    try {
                        const emailsResponse = await this.affinityClient.getEmails(entityType, entry.entity_id);
                        for (const email of emailsResponse.emails) {
                            emailsProcessed++;
                            if (await this.isInteractionSynced(email.id)) continue;

                            // Emails are often long, might skip deep AI enrichment to save cost/time or limit to subject+snippet
                            const content = `${email.subject}\n${email.body}`;
                            const embedding = await generateEmbedding(content.substring(0, 8000)); // Limit for OpenAI

                            await this.upsertInteraction({
                                affinity_interaction_id: email.id,
                                entity_id: entityDbId,
                                interaction_type: 'email',
                                subject: email.subject,
                                content_full: email.body,
                                content_preview: email.body.substring(0, 250),
                                company_id: entityType === 'organization' ? entityDbId : null,
                                started_at: email.sent_at,
                                embedding: embedding,
                                // Could add AI enrichment for emails later
                            });
                        }
                    } catch (e: any) {
                        errors.push(`Failed emails for ${entry.entity.name}: ${e.message}`);
                    }

                    // 3. MEETINGS
                    try {
                        const meetingsResponse = await this.affinityClient.getMeetings(entityType, entry.entity_id);
                        for (const meeting of meetingsResponse.meetings) {
                            meetingsProcessed++;
                            if (await this.isInteractionSynced(meeting.id)) continue;

                            const title = meeting.title || 'Untitled Meeting';
                            const embedding = await generateEmbedding(title);

                            await this.upsertInteraction({
                                affinity_interaction_id: meeting.id,
                                entity_id: entityDbId,
                                interaction_type: 'meeting',
                                subject: title,
                                content_full: title, // Meetings often have no agenda in API, just title
                                company_id: entityType === 'organization' ? entityDbId : null,
                                started_at: meeting.start_time,
                                ended_at: meeting.end_time,
                                embedding: embedding,
                            });
                        }
                    } catch (e: any) {
                        errors.push(`Failed meetings for ${entry.entity.name}: ${e.message}`);
                    }

                    // 4. REMINDERS
                    try {
                        const remindersResponse = await this.affinityClient.getReminders(entityType, entry.entity_id);
                        for (const reminder of remindersResponse.reminders) {
                            remindersProcessed++;
                            if (await this.isInteractionSynced(reminder.id)) continue;

                            const embedding = await generateEmbedding(reminder.content);

                            await this.upsertInteraction({
                                affinity_interaction_id: reminder.id,
                                entity_id: entityDbId,
                                interaction_type: 'reminder',
                                subject: 'Reminder',
                                content_full: reminder.content,
                                company_id: entityType === 'organization' ? entityDbId : null,
                                started_at: reminder.created_at, // or due_date
                                ended_at: reminder.due_date,
                                embedding: embedding,
                                ai_summary: reminder.completed ? 'Completed' : 'Pending'
                            });
                        }
                    } catch (e: any) {
                        errors.push(`Failed reminders for ${entry.entity.name}: ${e.message}`);
                    }
                }

                console.log(`   - Fetched ${entries.length} entries.`);
                pageToken = response.next_page_token;
            } while (pageToken);

        } catch (e: any) {
            errors.push(`Global sync error: ${e.message}`);
        } finally {
            console.log('\n📊 Sync Complete:');
            console.log(`   - Companies: ${companiesProcessed}`);
            console.log(`   - Notes: ${notesProcessed}`);
            console.log(`   - Emails: ${emailsProcessed}`);
            console.log(`   - Meetings: ${meetingsProcessed}`);
            console.log(`   - Reminders: ${remindersProcessed}`);
            if (errors.length > 0) {
                console.log('⚠️ Errors:');
                errors.forEach(err => console.error(`   - ${err}`));
            }
        }
    }

    private async isInteractionSynced(affinityId: number): Promise<boolean> {
        const { data } = await supabase
            .schema('graph')
            .from('interactions')
            .select('id')
            .eq('affinity_interaction_id', affinityId)
            .single();
        return !!data;
    }
}
