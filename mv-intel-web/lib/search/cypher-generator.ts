import OpenAI from 'openai';
import { driver, NEO4J_DATABASE } from '../neo4j';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const SCHEMA_CONTEXT = `
Nodes: 
- (:Entity { name: STRING, type: 'person' | 'organization', id: STRING, domain: STRING })
- Note: Both people and companies are 'Entity' nodes. Use 'type' property to distinguish.

Relationships:
- (:Entity {type: 'person'})-[:WORKS_AT]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:FOUNDED]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:BOARD_MEMBER_AT]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:ADVISOR_AT]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:PARTNER_AT]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:OWNER]->(:Entity {type: 'organization'})
- (:Entity {type: 'person'})-[:DEAL_TEAM]->(:Entity {type: 'organization'})
- (:Entity {type: 'organization'})-[:INVESTS_IN]->(:Entity {type: 'organization'})
- (:Entity {type: 'organization'})-[:CUSTOMER_OF]->(:Entity {type: 'organization'})
- (:Entity {type: 'organization'})-[:PARTNER_OF]->(:Entity {type: 'organization'})
- (:Entity {type: 'organization'})-[:COMPETITOR_OF]->(:Entity {type: 'organization'})

Key Rules:
1. Always use case-insensitive matching for names: WHERE toLower(n.name) CONTAINS toLower('query')
2. Always LIMIT results to 20.
3. Always RETURN the Node variables (e.g. RETURN p, c) or Relationships (RETURN r). 
   - DO NOT return individual properties like p.id, p.name. 
   - Correct: RETURN p
   - Incorrect: RETURN p.id, p.name
4. DO NOT use procedures like APOC.
5. Queries must be READ-ONLY (MATCH, RETURN only). No CREATE/MERGE/DELETE.
6. CRITICAL: Relationships DO NOT have properties like 'role', 'title', or 'job'. 
   - DO NOT write: -[r:WORKS_AT {role: 'CEO'}]->
   - DO NOT write: WHERE r.role = 'CEO'
   - Instead, just match the relationship pattern and return the person. 
7. CONNECTIONS ARE VIA ORGANIZATIONS:
   - People are connected to Organizations, not directly to other People (usually).
   - "Who knows the CEO of X?" means "Who is connected to Organization X?".
   - Pattern: MATCH (p:Entity {type: 'person'})-[]->(org:Entity {type: 'organization'}) WHERE ... RETURN p
   - Include diverse relationships: WORKS_AT, FOUNDED, BOARD_MEMBER_AT, ADVISOR_AT, PARTNER_AT, OWNER, DEAL_TEAM, INVESTS_IN
   - Example: "Who knows the CEO of Korr?" -> MATCH (p:Entity {type: 'person'})-[:OWNER|DEAL_TEAM|INVESTS_IN|BOARD_MEMBER_AT]->(c:Entity {type: 'organization'}) WHERE toLower(c.name) CONTAINS 'korr' RETURN p
`;

const SYSTEM_PROMPT = `You are a Cypher query generator for a Neo4j Knowledge Graph.
Translate the user's natural language query into a valid Cypher query.

${SCHEMA_CONTEXT}

Return ONLY the Cypher query string. Do not include markdown formatting or explanations.`;

export async function generateAndExecuteCypher(query: string) {
    // 1. Generate Cypher
    const completion = await openai.chat.completions.create({
        model: "gpt-4o", // Use a smart model for code generation
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query }
        ],
        temperature: 0
    });

    const cypher = completion.choices[0].message.content?.replace(/```cypher/g, '').replace(/```/g, '').trim();

    if (!cypher) {
        throw new Error('Failed to generate Cypher query');
    }

    console.log('📝 Generated Cypher:', cypher);

    // 2. Validate (Basic Security)
    const lowerCypher = cypher.toLowerCase();
    if (lowerCypher.includes('create') || lowerCypher.includes('merge') || lowerCypher.includes('delete') || lowerCypher.includes('set ')) {
        throw new Error('Security Violation: Write operations not allowed in search.');
    }

    // 3. Execute
    const session = driver.session({ database: NEO4J_DATABASE, defaultAccessMode: 'READ' });
    try {
        const result = await session.run(cypher);
        
        // 4. Format Results
        // We accept diverse return shapes, but try to standardize for the frontend
        // Common pattern: MATCH (n)-[r]->(m) RETURN n, r, m
        
        const formattedResults = result.records.map(record => {
            const obj: Record<string, any> = {};
            record.keys.forEach(key => {
                const val = record.get(key);
                if (val && val.properties) {
                    // Node or Relationship
                    obj[key] = {
                        ...val.properties,
                        label: val.labels ? val.labels[0] : val.type // Node label or Rel type
                    };
                } else {
                    obj[key] = val;
                }
            });
            return obj;
        });

        return { 
            cypher, 
            results: formattedResults 
        };

    } catch (error: any) {
        console.error('Cypher Execution Error:', error);
        throw new Error(`Graph query failed: ${error.message}`);
    } finally {
        await session.close();
    }
}

