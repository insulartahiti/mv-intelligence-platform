
import fetch from 'node-fetch';

async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'motive portfolio companies in new york' })
        });
        
        if (!res.ok) {
            console.error('Error:', res.status, await res.text());
            return;
        }

        const data = await res.json();
        const subgraph = data.subgraph || {};
        
        console.log(`Total Nodes: ${subgraph.nodes?.length}`);
        
        // Check Octaura specifically
        if (subgraph.nodes) {
            const octaura = subgraph.nodes.find((n: any) => n.label.toLowerCase().includes('octaura'));
            if (octaura) {
                console.log(`Found Octaura Node: Name="${octaura.label}" ID="${octaura.id}"`);
            } else {
                console.log('Octaura NOT found in subgraph nodes.');
            }
        }
    } catch (e) {
        console.error(e);
    }
}

test();
