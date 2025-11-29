import { createClient } from '@supabase/supabase-js';
import { AffinityClient } from './client';
import { NotesEnricher } from '../enrichment/notes';

// Configuration
const TARGET_LIST_NAME = "Motive Ventures Pipeline";

// Initialize services
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const affinity = new AffinityClient(process.env.AFFINITY_API_KEY!);
const notesEnricher = new NotesEnricher();

interface SyncStats {
    companiesProcessed: number;
    companiesUpserted: number;
    notesProcessed: number;
    notesEnriched: number;
    errors: string[];
}

export class AffinitySyncService {
    async syncPipelineList(): Promise<SyncStats> {
        const stats: SyncStats = {
            companiesProcessed: 0,
            companiesUpserted: 0,
            notesProcessed: 0,
            notesEnriched: 0,
            errors: []
        };

        try {
            console.log(`🔄 Finding Affinity List: "${TARGET_LIST_NAME}"...`);
            const lists = await affinity.getLists();
            const targetList = lists.find(l => l.name === TARGET_LIST_NAME);

            if (!targetList) {
                throw new Error(`List "${TARGET_LIST_NAME}" not found in Affinity.`);
            }

            console.log(`📋 Found List ID: ${targetList.id}. Fetching entries...`);
            
            // Pagination loop for list entries
            let pageToken: string | undefined | null = undefined;
            do {
                const response = await affinity.getListEntries(targetList.id, pageToken || undefined);
                
                // Correct property access based on debug: response.list_entries
                // We cast to any if TS complains, but we updated client type so it should be fine if imports reload
                const entries = (response as any).list_entries || [];

                console.log(`   - Fetched ${entries.length} entries.`);

                for (const entry of entries) {
                    try {
                        await this.processEntry(entry, stats);
                    } catch (err: any) {
                        console.error(`Error processing entry ${entry.entity?.name}:`, err);
                        stats.errors.push(`${entry.entity?.name}: ${err.message}`);
                    }
                }

                pageToken = response.next_page_token;
            } while (pageToken);

        } catch (error: any) {
            console.error('Sync failed:', error);
            stats.errors.push(`Global: ${error.message}`);
        }

        return stats;
    }

    private async processEntry(entry: any, stats: SyncStats) {
        const entity = entry.entity;
        // entry.entity_type is at the top level: 0 = Person, 1 = Organization
        const typeId = entry.entity_type ?? entity?.type;
        
        if (!entity || (typeId !== 0 && typeId !== 1)) {
             return; 
        }

        if (typeId === 1) {
            // --- ORGANIZATION ---
            stats.companiesProcessed++;
            const companyData = {
                name: entity.name,
                domain: entity.domain,
                affinity_id: entity.id,
                affinity_data: entry,
                type: 'organization',
                updated_at: new Date().toISOString()
            };

            const { data: upserted, error: upsertError } = await supabase
                .schema('graph')
                .from('entities')
                .upsert(companyData, { onConflict: 'affinity_id', ignoreDuplicates: false })
                .select('id')
                .single();

            if (upsertError) throw new Error(`Org Upsert failed: ${upsertError.message}`);
            stats.companiesUpserted++;
            await this.syncNotesForEntity(upserted.id, entity.id, 'organization', stats);

        } else if (typeId === 0) {
            // --- PERSON ---
            // Ingest people too, as requested
            stats.companiesProcessed++; // Reusing counter or add new one? Let's just count as processed entity
            
            const personData = {
                name: entity.name, // First + Last
                // People don't always have domains, but might have email domains?
                // We'll rely on name matching for now if affinity_id is new
                affinity_id: entity.id,
                affinity_data: entry,
                type: 'person',
                updated_at: new Date().toISOString()
            };

            const { data: upserted, error: upsertError } = await supabase
                .schema('graph')
                .from('entities')
                .upsert(personData, { onConflict: 'affinity_id', ignoreDuplicates: false })
                .select('id')
                .single();

            if (upsertError) throw new Error(`Person Upsert failed: ${upsertError.message}`);
            // stats.peopleUpserted++; // Can add granular stats later
            await this.syncNotesForEntity(upserted.id, entity.id, 'person', stats);
        }
    }

    private async syncNotesForEntity(internalId: string, affinityId: number, type: 'person' | 'organization', stats: SyncStats) {
        const { notes } = await affinity.getNotes(type, affinityId);
        
        for (const note of notes) {
            stats.notesProcessed++;

            // Check if note already exists to skip re-enrichment (expensive)
            const { data: existing } = await supabase
                .schema('graph')
                .from('interactions')
                .select('id, ai_summary') // Check if enriched
                .eq('affinity_note_id', note.id)
                .single();

            if (existing && existing.ai_summary) {
                continue; 
            }

            // New or unenriched note -> Run Analysis
            const analysis = await notesEnricher.analyzeNote(note.content);
            const embedding = await notesEnricher.generateEmbedding(note.content);
            stats.notesEnriched++;

            const interactionData = {
                entity_id: internalId,
                affinity_note_id: note.id,
                type: 'note',
                content: note.content,
                author_name: `Affinity User ${note.creator_id}`, // Mapping user IDs requires another lookup, skipped for MVP
                occurred_at: note.posted_at,
                summary: analysis.summary,
                risk_flags: analysis.risk_flags,
                key_themes: analysis.key_themes,
                embedding: embedding
            };

            await supabase
                .schema('graph')
                .from('interactions')
                .upsert(interactionData, { onConflict: 'affinity_note_id' });
        }
    }
}

