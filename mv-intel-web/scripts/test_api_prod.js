import('node-fetch').then(({default: fetch}) => {
    async function testProduction() {
        const PROD_URL = 'https://motivepartners.ai/api/chat';
        console.log('🚀 Testing Production API: ' + PROD_URL);
        try {
            const res = await fetch(PROD_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'motive portfolio companies in new york' })
            });
            if (!res.ok) {
                console.error('❌ API Error: ' + res.status);
                return;
            }
            const text = await res.text();
            console.log('✅ API Response Received (Length: ' + text.length + ' chars)');
            if (text.includes('event: thought')) console.log('✅ Stream format detected.');
        } catch (e) {
            console.error('❌ Connection Failed:', e.message);
        }
    }
    testProduction();
});
