const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class LinkedInImporter {
    constructor() {
        this.connections = [];
        this.stats = {
            totalRows: 0,
            matched: 0,
            created: 0,
            edgesCreated: 0,
            skipped: 0,
            errors: []
        };
    }

    async importConnections(csvPath) {
        console.log('📥 Importing LinkedIn connections...\n');

        // Parse CSV
        await this.parseCSV(csvPath);

        // Process connections
        await this.processConnections();

        // Create edges
        await this.createEdges();

        // Report
        this.printReport();
    }

    parseCSV(csvPath) {
        return new Promise((resolve, reject) => {
            const results = [];

            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', (row) => {
                    results.push(row);
                })
                .on('end', () => {
                    this.connections = results;
                    this.stats.totalRows = results.length;
                    console.log(`✅ Parsed ${results.length} connections from CSV\n`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    async processConnections() {
        console.log('🔍 Matching and creating entities...\n');

        for (let i = 0; i < this.connections.length; i++) {
            const conn = this.connections[i];

            if (i % 100 === 0) {
                console.log(`Progress: ${i}/${this.connections.length}`);
            }

            try {
                // Try to find existing entity by LinkedIn URL or name
                const entity = await this.findOrCreateEntity(conn);
                conn.entityId = entity.id;

            } catch (error) {
                this.stats.errors.push({ connection: conn, error: error.message });
                this.stats.skipped++;
            }
        }

        console.log(`\n✅ Processed ${this.connections.length} connections`);
    }

    async findOrCreateEntity(conn) {
        const fullName = `${conn['First Name']} ${conn['Last Name']}`.trim();
        const linkedinUrl = conn['URL'];
        const company = conn['Company'];
        const position = conn['Position'];

        // Skip empty rows
        if (!fullName || fullName === ' ') {
            this.stats.skipped++;
            throw new Error('Empty name');
        }

        // Try to find by LinkedIn URL first (most accurate)
        if (linkedinUrl) {
            const { data: byUrl } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, name')
                .eq('linkedin_url', linkedinUrl)
                .single();

            if (byUrl) {
                this.stats.matched++;
                return byUrl;
            }
        }

        // Try to find by exact name match
        const { data: byName } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, linkedin_url')
            .eq('name', fullName)
            .eq('type', 'person')
            .maybeSingle();

        if (byName) {
            // Update LinkedIn URL if we found by name
            if (linkedinUrl && !byName.linkedin_url) {
                await supabase
                    .schema('graph')
                    .from('entities')
                    .update({ linkedin_url: linkedinUrl })
                    .eq('id', byName.id);
            }
            this.stats.matched++;
            return byName;
        }

        // Create new entity
        const newEntity = {
            name: fullName,
            type: 'person',
            linkedin_url: linkedinUrl || null,
            brief_description: position || null,
            source: 'linkedin_import',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: created, error } = await supabase
            .schema('graph')
            .from('entities')
            .insert(newEntity)
            .select('id, name')
            .single();

        if (error) throw error;

        this.stats.created++;
        return created;
    }

    async createEdges() {
        console.log('\n🔗 Creating LinkedIn connection edges...\n');

        // Get the current user's entity (we'll need to determine who "you" are)
        // For now, we'll create edges between all LinkedIn connections
        // and mark them aslinkedin_connection type

        const edges = [];
        const edgeSet = new Set(); // To avoid duplicate edges

        for (const conn of this.connections) {
            if (!conn.entityId) continue;

            // Create edge from "user" to connection
            // You'll need to identify who the LinkedIn account owner is
            // For now, we'll just mark these as linkedin connections
            // and can connect them to a user entity later

            const edgeKey = `linkedin_${conn.entityId}`;
            if (!edgeSet.has(edgeKey)) {
                edges.push({
                    source: conn.entityId, // Will need to update with actual user entity
                    target: conn.entityId,
                    kind: 'linkedin_connection',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                edgeSet.add(edgeKey);
            }
        }

        // Batch insert edges
        if (edges.length > 0) {
            const batchSize = 1000;
            for (let i = 0; i < edges.length; i += batchSize) {
                const batch = edges.slice(i, i + batchSize);
                const { error } = await supabase
                    .schema('graph')
                    .from('edges')
                    .insert(batch);

                if (error) {
                    console.error(`Error inserting edge batch ${i}-${i + batch.length}:`, error);
                } else {
                    this.stats.edgesCreated += batch.length;
                }
            }
        }

        console.log(`✅ Created ${this.stats.edgesCreated} LinkedIn connection edges`);
    }

    printReport() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 LINKEDIN IMPORT REPORT');
        console.log('='.repeat(50));
        console.log(`Total CSV rows:        ${this.stats.totalRows}`);
        console.log(`Matched existing:      ${this.stats.matched}`);
        console.log(`Created new:           ${this.stats.created}`);
        console.log(`Edges created:         ${this.stats.edgesCreated}`);
        console.log(`Skipped:               ${this.stats.skipped}`);
        console.log(`Errors:                ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  - ${e.connection['First Name']} ${e.connection['Last Name']}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more`);
            }
        }
        console.log('='.repeat(50) + '\n');
    }
}

// Run import
const importer = new LinkedInImporter();
importer.importConnections('/Users/harshgovil/mv-intelligence-platform/Connections.csv')
    .then(() => {
        console.log('✨ Import complete!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Import failed:', error);
        process.exit(1);
    });
