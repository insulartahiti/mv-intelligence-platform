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
    console.log('🧪 Starting QA Harness for Universal Search (Streaming API)...');
    console.log('==========================================================');

    const resultsLog = [];

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
                    message: scenario.query,
                    // Mock user context if needed for generic tests
                    userEntity: { id: 'mock-user-id', name: 'Test User' }
                })
            });

            if (!res.ok) {
                console.error(`❌ API Error: ${res.status} ${res.statusText}`);
                continue;
            }

            if (!res.body) {
                console.error('❌ No response body!');
                continue;
            }

            // Streaming Response Handling with BUFFER
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let finalData = null;
            let thoughts = [];
            
            // Buffer for accumulating split chunks
            let buffer = "";

            while (!done) {
                const { value, done: streamDone } = await reader.read();
                done = streamDone;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;
                    
                    // Process complete lines
                    const lines = buffer.split('\n');
                    
                    // Keep the last potentially incomplete line in the buffer
                    buffer = lines.pop() || ""; 

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        try {
                            const event = JSON.parse(trimmedLine);
                            if (event.type === 'thought') {
                                thoughts.push(event.content);
                            } else if (event.type === 'final') {
                                finalData = event;
                            } else if (event.type === 'error') {
                                console.error(`❌ Server Error: ${event.message}`);
                            }
                        } catch (e) {
                            // Should not happen with proper buffering unless JSON is malformed
                            console.warn(`⚠️ JSON Parse Error on line: ${trimmedLine.substring(0, 50)}...`);
                        }
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const event = JSON.parse(buffer.trim());
                    if (event.type === 'final') finalData = event;
                } catch (e) {
                    // console.warn('⚠️ Final buffer incomplete');
                }
            }

            const duration = Date.now() - startTime;

            if (finalData) {
                console.log(`🤖 Response (${duration}ms):`);
                console.log(finalData.reply ? finalData.reply.trim() : "No text reply");
                
                const nodeCount = finalData.relevantNodeIds?.length || 0;
                const subgraphNodes = finalData.subgraph?.nodes?.length || 0;
                const subgraphEdges = finalData.subgraph?.edges?.length || 0;

                console.log(`📊 Metrics: ${nodeCount} relevant nodes, Graph: ${subgraphNodes} nodes / ${subgraphEdges} edges`);
                
                // Check if we got graph data (fail if 0 nodes for non-informational queries)
                if (subgraphNodes === 0 && !scenario.category.includes("Basic Lookup")) { // Basic lookup might just answer text
                     // console.warn("   ⚠️ Warning: Empty subgraph returned");
                }

                resultsLog.push({
                    ...scenario,
                    success: true,
                    response: finalData.reply,
                    thoughts: thoughts,
                    nodeCount,
                    graphStats: { nodes: subgraphNodes, edges: subgraphEdges },
                    duration
                });
            } else {
                console.error("❌ Failed to get 'final' event from stream");
                 resultsLog.push({
                    ...scenario,
                    success: false,
                    error: "No final event received"
                });
            }

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
        await new Promise(r => setTimeout(r, 500)); 
    }

    // Write log to file
    fs.writeFileSync('qa_results.json', JSON.stringify(resultsLog, null, 2));
    console.log('\n📝 Results saved to qa_results.json');
}

// Run
runTest();
