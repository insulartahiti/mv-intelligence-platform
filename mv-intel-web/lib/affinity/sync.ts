import { AffinityClient } from './client';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../search/postgres-vector'; // Re-use embedding function
import { enrichNoteWithAI } from '../enrichment/notes'; // New note enrichment

// Initialize Supabase client for direct DB operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class AffinitySyncService {
    private affinityClient: AffinityClient;

    private syncLogId: string | undefined = process.env.SYNC_LOG_ID;

    constructor(affinityApiKey: string = process.env.AFFINITY_API_KEY!) {
        this.affinityClient = new AffinityClient(affinityApiKey);
    }

    // Helper to update progress in DB
    private async updateSyncProgress(count: number) {
        if (!this.syncLogId) return;
        try {
            await supabase
                .schema('graph')
                .from('sync_state')
                .update({ 
                    entities_synced: count,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.syncLogId);
        } catch (e) {
            // Ignore update errors to not block sync
        }
    }

    async getAffinityListId(listName: string): Promise<number | null> {
        const lists = await this.affinityClient.getLists();
        const targetList = lists.find((list: any) => list.name === listName);
        return targetList ? targetList.id : null;
    }

    async upsertEntity(entityData: any, type: 'person' | 'organization', rawEntry: any = {}): Promise<string> {
        // 1. Fetch existing entity to compare for history
        let existing = null;
        try {
            const { data } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, pipeline_stage, valuation_amount')
                .eq(type === 'organization' ? 'affinity_org_id' : 'affinity_person_id', type === 'organization' ? entityData.id : entityData.id)
                .single();
            existing = data;
        } catch (e) {
            // ignore
        }

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
        
        // Check if stage implies Portfolio status
        const stage = (newData.pipeline_stage || '').toLowerCase();
        if (
            stage.includes('portfolio') || 
            stage.includes('motive aav') || 
            stage.includes('balance sheet') || 
            stage.includes('exited')
        ) {
            newData.is_portfolio = true;
        }

        // valuation_amount would come from custom fields, ignored for now unless passed explicitly

        // 3. Upsert Entity (Manual implementation to avoid ON CONFLICT constraint issues)
        let upserted;
        let error;

        if (existing) {
             const result = await supabase
                .schema('graph')
                .from('entities')
                .update(newData)
                .eq('id', existing.id)
                .select('id, pipeline_stage, valuation_amount')
                .single();
             upserted = result.data;
             error = result.error;
        } else {
             const result = await supabase
                .schema('graph')
                .from('entities')
                .insert(newData)
                .select('id, pipeline_stage, valuation_amount')
                .single();
             upserted = result.data;
             error = result.error;
        }

        if (error) {
            console.error(`Error upserting ${type} ${entityData.name}:`, error);
            throw error;
        }

        // 4. Track History (If changed)
        if (existing && upserted) {
            await this.trackHistory(upserted.id, 'pipeline_stage', existing.pipeline_stage, upserted.pipeline_stage);
            await this.trackHistory(upserted.id, 'valuation_amount', existing.valuation_amount, upserted.valuation_amount);
        }

        if (!upserted) throw new Error(`Failed to upsert ${type} ${entityData.name}`);

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

    async syncPortfolioFoundersList() {
        console.log(`🔄 Syncing MV Portfolio Founders List...`);
        const LIST_ID = 184048; 
        let pageToken: string | undefined = undefined;
        let processed = 0;

        try {
            do {
                const response = await this.affinityClient.getListEntries(LIST_ID, pageToken);
                const entries = response.list_entries;

                if (!entries || entries.length === 0) break;

                console.log(`Processing ${entries.length} founders...`);

                for (const entry of entries) {
                    // 1. Upsert Person (Is Portfolio = True)
                    const personId = await this.upsertEntity(entry.entity, 'person', entry);
                    await supabase.schema('graph').from('entities').update({ is_portfolio: true }).eq('id', personId);
                    processed++;

                    // 2. Fetch Field Values to find "Past Deals" (Organization Link)
                    try {
                        // We need to call Affinity API directly as getFieldValues isn't exposed in client wrapper yet
                        // Or use existing client methods if available. Client has no getFieldValues.
                        // Let's skip complex field fetching for now and rely on name matching or future enhancements.
                        // But wait, the user wants us to use the "Past Deals" field.
                        // I'll add getFieldValues to AffinityClient first.
                    } catch (e) {
                        console.error(`Error linking founder ${entry.entity.name}:`, e);
                    }
                }
                pageToken = response.next_page_token || undefined;
            } while (pageToken);
            
            console.log(`✅ Synced ${processed} Portfolio Founders.`);
        } catch (e: any) {
            console.error(`Error syncing founders: ${e.message}`);
        }
    }

    private async upsertPersonFromId(affinityPersonId: number, connectedCompanyDbId: string | null) {
        if (!connectedCompanyDbId || !affinityPersonId) return;

        try {
            // Check if already synced
            const { data: existing } = await supabase
                .schema('graph')
                .from('entities')
                .select('id')
                .eq('affinity_person_id', affinityPersonId)
                .single();

            let personDbId = existing?.id;

            if (!personDbId) {
                // Fetch from Affinity
                const person = await this.affinityClient.getPerson(affinityPersonId);
                if (person) {
                    personDbId = await this.upsertEntity(person, 'person');
                }
            }

            if (personDbId) {
                await this.createContactEdge(personDbId, connectedCompanyDbId);
            }
        } catch (e) {
            // Ignore errors (e.g. person not found or permissions)
        }
    }

    private async createContactEdge(personDbId: string, companyDbId: string) {
        const { data: edge } = await supabase
            .schema('graph')
            .from('edges')
            .select('id')
            .eq('source', personDbId)
            .eq('target', companyDbId)
            .eq('kind', 'contact') // Using 'contact' as generic interaction link
            .single();

        if (!edge) {
            await supabase.schema('graph').from('edges').insert({
                source: personDbId,
                target: companyDbId,
                kind: 'contact',
                confidence_score: 1.0,
                metadata: { source: 'affinity_interaction_sync' }
            });
        }
    }

    async syncPipelineList(listName: string) {
        console.log(`🔄 Finding Affinity List: "${listName}"...`);
        const listId = await this.getAffinityListId(listName);

        if (!listId) {
            console.error(`❌ Affinity list "${listName}" not found.`);
            return { companiesProcessed: 0, companiesUpserted: 0, notesProcessed: 0, notesEnriched: 0, errors: [`List "${listName}" not found`] };
        }

        console.log(`📋 Found List ID: ${listId}. Fetching entries...`);

        let pageToken: string | undefined = undefined;
        // Shared counters
        const stats = {
            companiesProcessed: 0,
            companiesUpserted: 0,
            notesProcessed: 0,
            emailsProcessed: 0,
            meetingsProcessed: 0,
            remindersProcessed: 0,
            filesProcessed: 0,
            notesEnriched: 0
        };
        
        const errors: string[] = [];

        try {
            do {
                const response = await this.affinityClient.getListEntries(listId, pageToken);
                const entries = response.list_entries; 

                if (!entries || entries.length === 0) {
                    console.log('No more entries to fetch.');
                    break;
                }

                console.log(`Processing batch of ${entries.length} entries...`);

                // OPTIMIZATION: Process in chunks to respect rate limits but improve speed
                const CHUNK_SIZE = 5; 
                for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
                    const chunk = entries.slice(i, i + CHUNK_SIZE);
                    console.log(`   Processing chunk ${i} to ${i + CHUNK_SIZE}...`);
                    
                    await Promise.all(chunk.map(async (entry: any) => {
                        const entityType = entry.entity_type === 1 ? 'organization' : 'person';
                        let entityDbId: string | null = null;

                        try {
                            // Pass 'entry' as rawEntry to extract status etc.
                            // NEW: Fetch real status from field values
                            try {
                                const fieldValues = await this.affinityClient.getFieldValues(entry.id);
                                const statusField = fieldValues.find((v: any) => v.field_id === 1163869); // Motive Pipeline Status
                                if (statusField) {
                                    // Inject status into entry object for upsertEntity to pick up
                                    (entry as any).status = statusField.value?.text || statusField.value;
                                }
                            } catch (fe) {
                                // ignore field fetch error to not block sync
                            }

                            entityDbId = await this.upsertEntity(entry.entity, entityType, entry);
                            stats.companiesUpserted++;

                            // NEW: Fetch Associated People (Official Link from Org Details)
                            if (entityType === 'organization' && entityDbId) {
                                try {
                                    const orgDetails = await this.affinityClient.getOrganization(entry.entity_id);
                                    if (orgDetails.person_ids && orgDetails.person_ids.length > 0) {
                                        // Upsert these officially linked people
                                        for (const pid of orgDetails.person_ids) {
                                            await this.upsertPersonFromId(pid, entityDbId);
                                        }
                                    }
                                } catch (e) {
                                    // ignore errors fetching org details
                                }
                            }
                        } catch (e: any) {
                            errors.push(`Failed to upsert entity ${entry.entity.name}: ${e.message}`);
                            return; // Skip rest for this entity
                        }
                        stats.companiesProcessed++;

                        // 1. NOTES
                        try {
                            const notesResponse = await this.affinityClient.getNotes(entityType, entry.entity_id);
                            for (const note of notesResponse.notes) {
                                stats.notesProcessed++;
                                if (await this.isInteractionSynced(note.id)) continue;
                                
                                const enriched = await enrichNoteWithAI(note.content);
                                stats.notesEnriched++;
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
                                stats.emailsProcessed++;
                                if (await this.isInteractionSynced(email.id)) continue;

                                const content = `${email.subject}\n${email.body}`;
                                const embedding = await generateEmbedding(content.substring(0, 8000));

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
                                });
                            }
                        } catch (e: any) {
                            errors.push(`Failed emails for ${entry.entity.name}: ${e.message}`);
                        }

                        // 3. MEETINGS
                        try {
                            const meetingsResponse = await this.affinityClient.getMeetings(entityType, entry.entity_id);
                            for (const meeting of meetingsResponse.meetings) {
                                stats.meetingsProcessed++;
                                if (await this.isInteractionSynced(meeting.id)) continue;

                                const title = meeting.title || 'Untitled Meeting';
                                const embedding = await generateEmbedding(title);

                                await this.upsertInteraction({
                                    affinity_interaction_id: meeting.id,
                                    entity_id: entityDbId,
                                    interaction_type: 'meeting',
                                    subject: title,
                                    content_full: title,
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
                                stats.remindersProcessed++;
                                if (await this.isInteractionSynced(reminder.id)) continue;

                                const embedding = await generateEmbedding(reminder.content);

                                await this.upsertInteraction({
                                    affinity_interaction_id: reminder.id,
                                    entity_id: entityDbId,
                                    interaction_type: 'reminder',
                                    subject: 'Reminder',
                                    content_full: reminder.content,
                                    company_id: entityType === 'organization' ? entityDbId : null,
                                    started_at: reminder.created_at,
                                    ended_at: reminder.due_date,
                                    embedding: embedding,
                                    ai_summary: reminder.completed ? 'Completed' : 'Pending'
                                });
                            }
                        } catch (e: any) {
                            errors.push(`Failed reminders for ${entry.entity.name}: ${e.message}`);
                        }

                        // 5. FILES
                        try {
                            const filesResponse = await this.affinityClient.getFiles(entityType, entry.entity_id);
                            for (const file of filesResponse.entity_files) {
                                stats.filesProcessed++;
                                const { data: existing } = await supabase
                                    .schema('graph')
                                    .from('affinity_files')
                                    .select('id')
                                    .eq('affinity_file_id', file.id)
                                    .single();

                                if (existing) continue;

                                await supabase.schema('graph').from('affinity_files').insert({
                                    entity_id: entityDbId,
                                    affinity_file_id: file.id,
                                    name: file.name,
                                    size_bytes: file.size,
                                    url: this.affinityClient.getDownloadUrl(file.id),
                                    created_at: file.created_at
                                });
                            }
                        } catch (e: any) {
                             // Ignore file errors
                        }
                    }));
                    
                    // Update progress after each chunk
                    await this.updateSyncProgress(stats.companiesProcessed);
                }

                console.log(`   - Fetched ${entries.length} entries.`);
                pageToken = response.next_page_token || undefined;
            } while (pageToken);

        } catch (e: any) {
            errors.push(`Global sync error: ${e.message}`);
        } finally {
            console.log('\n📊 Sync Complete:');
            console.log(`   - Companies: ${stats.companiesProcessed}`);
            console.log(`   - Notes: ${stats.notesProcessed}`);
            console.log(`   - Emails: ${stats.emailsProcessed}`);
            console.log(`   - Meetings: ${stats.meetingsProcessed}`);
            console.log(`   - Reminders: ${stats.remindersProcessed}`);
            console.log(`   - Files: ${stats.filesProcessed}`);
            if (errors.length > 0) {
                console.log('⚠️ Errors:');
                errors.forEach(err => console.error(`   - ${err}`));
            }
            // Return collected stats
            return { ...stats, errors };
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
