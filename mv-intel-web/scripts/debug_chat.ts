import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// QA Test Suite
const TEST_SCENARIOS = [
    {
        category: "Basic Lookup",
        query: "What does Navro do?",
        intent: "Sanity check"
    }
];

async function runTest() {
    console.log('🧪 Debugging Streaming API...');
    
    const scenario = TEST_SCENARIOS[0];
    console.log(`👤 Query: "${scenario.query}"`);
    
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: scenario.query,
                userEntity: { id: 'mock-user-id', name: 'Test User' }
            })
        });

        if (!res.ok) {
            console.error(`❌ API Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error("Response:", text);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                console.log(`📦 RAW CHUNK: ${chunk.substring(0, 200)}...`);
                
                const lines = chunk.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line);
                        console.log(`   ✅ Parsed Event: ${event.type}`);
                        if (event.type === 'error') {
                            console.error(`   ❌ ERROR EVENT: ${event.error}`);
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ JSON Parse Error: ${e.message}`);
                    }
                }
            }
        }
        console.log("✅ Stream Closed");

    } catch (e: any) {
        console.error(`❌ Request Failed: ${e.message}`);
    }
}

runTest();

