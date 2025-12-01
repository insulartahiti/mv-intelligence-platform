
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
console.log('Loading env from:', envPath);
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addUsers() {
    const users = [
        { email: 'harsh.govil@motivepartners.com', name: 'Harsh Govil' },
        { email: 'harsh@motivepartners.com', name: 'Harsh' }
    ];

    console.log('Adding users to allowed_users table...');

    for (const user of users) {
        const { error } = await supabase
            .from('allowed_users')
            .upsert(user, { onConflict: 'email' })
            .select()
            .single();

        if (error) {
            console.error(`❌ Failed to add ${user.email}:`, error.message);
        } else {
            console.log(`✅ Added ${user.email}`);
        }
    }
}

addUsers();

