const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, 'mv-intel-web/.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const { data, error } = await supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .order('last_sync_timestamp', { ascending: false })
        .limit(3); // Get last 3 to see history

    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

check();

