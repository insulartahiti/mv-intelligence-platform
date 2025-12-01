
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

console.log('Loading env from:', envPath);
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function migrateConsensusTaxonomy() {
    console.log('Starting migration of IFT.CONS -> IFT.CRYP.CONS...');

    // Fetch all entities starting with IFT.CONS
    const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, taxonomy')
        .ilike('taxonomy', 'IFT.CONS%');

    if (error) {
        console.error('Error fetching entities:', error);
        return;
    }

    console.log(`Found ${entities.length} entities to migrate.`);

    let successCount = 0;
    let failCount = 0;

    for (const entity of entities) {
        const oldTaxonomy = entity.taxonomy;
        const newTaxonomy = oldTaxonomy.replace('IFT.CONS', 'IFT.CRYP.CONS');

        console.log(`Migrating "${entity.name}": ${oldTaxonomy} -> ${newTaxonomy}`);

        const { error: updateError } = await supabase
            .schema('graph')
            .from('entities')
            .update({ taxonomy: newTaxonomy })
            .eq('id', entity.id);

        if (updateError) {
            console.error(`Failed to update ${entity.name}:`, updateError);
            failCount++;
        } else {
            successCount++;
        }
    }

    console.log('Migration complete.');
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${failCount}`);
}

migrateConsensusTaxonomy();

