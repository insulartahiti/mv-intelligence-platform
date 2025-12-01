const fetch = require('node-fetch');

async function testProduction() {
    const PROD_URL = 'https://motivepartners.ai/api/chat';
    
    console.log(`🚀 Testing Production API: ${PROD_URL}`);
    
    try {
        const res = await fetch(PROD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: 'motive portfolio companies in new york',
                model: 'gpt-4o' // or whatever default the API expects
            })
        });
        
        if (!res.ok) {
            console.error(`❌ API Error: ${res.status} ${res.statusText}`);
            console.error(await res.text());
            return;
        }

        // The chat API returns a stream, but node-fetch might handle it as a body we can read.
        // Let's try to read it as text and see if we get the expected event stream format.
        const text = await res.text();
        console.log(`✅ API Response Received (Length: ${text.length} chars)`);
        
        // Basic validation of the stream content
        if (text.includes('event: thought') || text.includes('event: final') || text.includes('data:')) {
            console.log('✅ Response format looks like a valid event stream.');
        } else {
            console.warn('⚠️ Response format might not be an event stream.');
            console.log('Snippet:', text.substring(0, 500));
        }

        // Check for specific content if possible (simple regex match)
        if (text.match(/motive/i) || text.match(/portfolio/i)) {
             console.log('✅ Content validation passed (keywords found).');
        }

    } catch (e) {
        console.error('❌ Connection Failed:', e.message);
    }
}

testProduction();

