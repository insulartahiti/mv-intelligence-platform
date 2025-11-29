import { classifyIntent } from '../lib/search/intent';
import { generateAndExecuteCypher } from '../lib/search/cypher-generator';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function runTests() {
    console.log('🧪 Starting Universal Search Agent Tests...\n');

    // TEST 1: Intent Classification
    console.log('--- Test 1: Intent Classification ---');
    const testQueries = [
        "Steward",
        "Who invests in Steward?",
        "Companies connected to Julia Hubo",
        "Summarize trends in fintech",
        "What is the portfolio exposure to crypto?",
        "Show me people who work at Stripe",
        "Relationship between Penta and Stripe"
    ];

    for (const q of testQueries) {
        const result = await classifyIntent(q);
        console.log(`Query: "${q}" \n  -> Intent: ${result.intent} (Confidence: ${result.confidence})`);
        // Simple assertion log
        if (q.includes("Steward") && !q.includes("invests") && result.intent !== 'ENTITY_LOOKUP') console.warn('  ⚠️ Unexpected Intent!');
        if (q.includes("invests") && result.intent !== 'RELATIONSHIP_QUERY') console.warn('  ⚠️ Unexpected Intent!');
        if (q.includes("Summarize") && result.intent !== 'MARKET_INSIGHT') console.warn('  ⚠️ Unexpected Intent!');
    }
    console.log('\n');

    // TEST 2: Text-to-Cypher Generation (Live)
    // We only run this if we have OpenAI key, which we should
    if (process.env.OPENAI_API_KEY) {
        console.log('--- Test 2: Cypher Generation (Live) ---');
        
        const cypherQueries = [
            "Who invests in Steward?",
            "Who works at Stripe?"
        ];

        for (const q of cypherQueries) {
            console.log(`Generating Cypher for: "${q}"`);
            try {
                // We'll mock the execution part if we can't connect, but let's try calling the generator
                // We might need to mock driver.session if we don't want to actually hit Neo4j yet, 
                // or we can just let it fail on execution but print the Cypher.
                // Actually, let's modify the test to just print the Cypher if execution fails, 
                // or we can just try running it.
                
                // Note: generateAndExecuteCypher does both. 
                // Let's rely on it printing '📝 Generated Cypher:' to stdout.
                await generateAndExecuteCypher(q);
            } catch (err: any) {
                console.log(`  Expected Execution Error (if local DB not accessible): ${err.message}`);
                // If the error is about connection, that's fine, we want to see the generated cypher in logs
            }
            console.log('---');
        }
    } else {
        console.log('⚠️ Skipping Cypher Test: No OPENAI_API_KEY found.');
    }
}

runTests().catch(console.error);

