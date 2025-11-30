import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// QA Test Suite based on Universal Search Guide
const TEST_SCENARIOS = [
    // 1. Basic Lookup
    {
        category: "Basic Lookup",
        query: "What does Navro do, in one sentence, and what problem are they solving?",
        intent: "Sanity check entity resolution and profile retrieval."
    },
    {
        category: "Basic Lookup",
        query: "List all current portfolio companies in payments.",
        intent: "Test simple attribute filtering (is_portfolio=true, industry=payments)."
    },

    // 2. Fuzzy Naming
    {
        category: "Fuzzy Naming",
        query: "Find Triver, even if I spell it like 'Tryver'.",
        intent: "Test vector search robustness against typos."
    },

    // 3. Attribute Filtering
    {
        category: "Attribute Filtering",
        query: "Show me all companies in B2B fintech based in Europe.",
        intent: "Test multi-constraint filtering (Location + Industry + Business Model)."
    },

    // 4. Thematic Search
    {
        category: "Thematic Search",
        query: "Which companies help banks modernize their core systems without doing a full core replacement?",
        intent: "Test semantic understanding of 'modernization' and 'core banking' concepts."
    },
    {
        category: "Thematic Search",
        query: "Find companies enabling embedded finance.",
        intent: "Test broad thematic tagging."
    },

    // 5. Relationships
    {
        category: "Relationships",
        query: "Which portfolio companies sell to the same type of customer as Navro?",
        intent: "Test graph traversal or similarity based on 'target_customer'."
    },
    {
        category: "Relationships",
        query: "Show the path of relationships from us to Hero.",
        intent: "Test path finding logic."
    },

    // 6. Similarity
    {
        category: "Similarity",
        query: "Which companies are most similar to Triver based on business model?",
        intent: "Test 'companies like X' vector similarity."
    },

    // 7. Temporal/Lifecycle (Mocked/Future Capability)
    {
        category: "Temporal",
        query: "Show me all new companies added to the pipeline in the last 90 days.",
        intent: "Test date filtering (created_at > now-90d)."
    }
];

async function runTest() {
    console.log('🧪 Starting QA Harness for Universal Search...');
    console.log('=============================================');

    const resultsLog = [];

    // Create a new conversation for each test to avoid context pollution, 
    // or keep it for follow-ups? The guide implies standalone queries mostly.
    // We'll use one conversation per scenario for clean testing.

    for (const scenario of TEST_SCENARIOS) {
        console.log(`\n📂 Category: ${scenario.category}`);
        console.log(`🎯 Intent: ${scenario.intent}`);
        console.log(`👤 Query: "${scenario.query}"`);
        
        try {
            const startTime = Date.now();
            const res = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: scenario.query
                    // No conversationId -> Start fresh
                })
            });

            const duration = Date.now() - startTime;

            if (!res.ok) {
                console.error(`❌ API Error: ${res.status} ${res.statusText}`);
                continue;
            }

            const data = await res.json();
            
            console.log(`🤖 Response (${duration}ms):`);
            console.log(data.reply.trim());
            
            const nodeCount = data.relevantNodeIds?.length || 0;
            const subgraphNodes = data.subgraph?.nodes?.length || 0;
            const subgraphEdges = data.subgraph?.edges?.length || 0;

            console.log(`📊 Metrics: ${nodeCount} matches, Graph: ${subgraphNodes} nodes / ${subgraphEdges} edges`);

            resultsLog.push({
                ...scenario,
                success: true,
                response: data.reply,
                nodeCount,
                duration
            });

        } catch (e: any) {
            console.error(`❌ Request Failed: ${e.message}`);
            resultsLog.push({
                ...scenario,
                success: false,
                error: e.message
            });
        }
        
        console.log('---------------------------------------------');
        // Small delay to be nice to the local server
        await new Promise(r => setTimeout(r, 1000)); 
    }

    // Write log to file
    fs.writeFileSync('qa_results.json', JSON.stringify(resultsLog, null, 2));
    console.log('\n📝 Results saved to qa_results.json');
}

// Wait for server to potentially start
console.log('⏳ Waiting 5s for server to settle...');
setTimeout(runTest, 5000);
