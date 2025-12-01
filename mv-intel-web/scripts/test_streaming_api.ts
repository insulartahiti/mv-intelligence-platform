
async function testStream() {
    console.log("🚀 Testing Streaming API...");
    
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: 'show my portfolio companies',
                // Mock user entity to trigger get_user_deals
                userEntity: { id: '3e91e90b-bd38-44a9-b7a3-ddff909e4bd5', name: 'Harsh Govil' } 
            })
        });

        if (!res.ok) {
            console.error('Error:', res.status, await res.text());
            return;
        }

        if (!res.body) {
            console.error('No response body!');
            return;
        }

        // Native fetch stream handling
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());
                
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line);
                        console.log(`📦 Event [${event.type}]:`, 
                            event.type === 'thought' ? event.content : 
                            event.type === 'final' ? `Graph Nodes: ${event.relevantNodeIds?.length}, Edges: ${event.subgraph?.edges?.length}` : 
                            'OK'
                        );
                        
                        if (event.type === 'final' && (!event.subgraph || event.subgraph.nodes?.length === 0)) {
                            console.error("❌ CRITICAL: Final event has EMPTY subgraph!");
                        }
                    } catch (e) {
                        console.log('⚠️ Partial Chunk/Parse Error:', line.substring(0, 50) + '...');
                    }
                }
            }
        }

        console.log("✅ Stream Complete");

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

testStream();
