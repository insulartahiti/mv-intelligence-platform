const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

// Load .env
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../../.env.local')
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function cleanGarbage() {
  console.log('🗑️  Starting Garbage Cleanup...');
  const client = await pool.connect();
  const session = driver.session();

  try {
    // 1. Delete Merged Names (Email artifacts)
    const mergedResult = await client.query(`
      DELETE FROM graph.entities 
      WHERE name LIKE '%;%' 
         OR name LIKE '%<%' 
         OR name LIKE '%>%'
      RETURNING id, name
    `);
    console.log(`   - Deleted ${mergedResult.rowCount} merged/email artifact entities from Postgres.`);

    // 2. Delete Generic/Job Title Nodes
    const garbageNames = [
        'CEO', 'CTO', 'CFO', 'COO', 'Founder', 'Co-Founder', 
        'Advisor', 'Board Member', 'Investor', 'Partner', 'Principal',
        'Director', 'Manager', 'Vice President', 'President',
        'Chairman', 'Head of', 'Lead', 'Senior', 'Junior',
        'PhD', 'MBA', 'CFA', 'CPA', 'JD', 'MD'
    ];
    
    // Use regex for Postgres
    const genericResult = await client.query(`
        DELETE FROM graph.entities
        WHERE name = ANY($1)
           OR name ILIKE '%CEO)%'
           OR name ILIKE '%Advisor)%'
           OR name ILIKE '%Manager)%'
        RETURNING id, name
    `, [garbageNames]);
    console.log(`   - Deleted ${genericResult.rowCount} generic title entities from Postgres.`);

    // 3. Neo4j Cleanup (Mirror Postgres)
    await session.run(`
      MATCH (n:Entity)
      WHERE n.name CONTAINS ';' 
         OR n.name CONTAINS '<' 
         OR n.name CONTAINS '>'
         OR n.name IN $garbageNames
         OR n.name ENDS WITH ')'
      DETACH DELETE n
    `, { garbageNames });
    console.log(`   - Synced cleanup with Neo4j.`);

  } finally {
    client.release();
    await session.close();
  }
}

async function deduplicatePeople() {
  console.log('👯 Starting Person Deduplication...');
  const client = await pool.connect();

  try {
    // Find duplicates by name
    const duplicates = await client.query(`
      SELECT lower(name) as lname, count(*) as cnt
      FROM graph.entities
      WHERE type = 'person'
      GROUP BY lower(name)
      HAVING count(*) > 1
    `);

    console.log(`   - Found ${duplicates.rowCount} names with duplicates.`);

    for (const row of duplicates.rows) {
      const name = row.lname;
      
      // Fetch all entities for this name
      const entities = await client.query(`
        SELECT id, name, business_analysis, domain, enriched, enrichment_source
        FROM graph.entities
        WHERE lower(name) = $1 AND type = 'person'
      `, [name]);

      if (entities.rows.length < 2) continue;

      // Score them
      const scored = await Promise.all(entities.rows.map(async (e) => {
        let score = 0;
        
        // Valid Analysis
        if (e.business_analysis && !JSON.stringify(e.business_analysis).includes('Insufficient information')) {
            score += 10;
        }
        
        // Domain present
        if (e.domain) score += 5;
        
        // Enriched
        if (e.enriched) score += 2;

        // Edge count (check DB)
        const edges = await client.query('SELECT count(*) FROM graph.edges WHERE source = $1 OR target = $1', [e.id]);
        score += parseInt(edges.rows[0].count);

        return { ...e, score };
      }));

      // Sort desc by score
      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0];
      const losers = scored.slice(1);

      console.log(`   Processing "${winner.name}": Keeping ID ${winner.id} (Score ${winner.score}), removing ${losers.length} others.`);

      // Merge Edges from Losers to Winner
      for (const loser of losers) {
        // 1. Handle Outgoing Edges (Source = Loser)
        const outEdges = await client.query('SELECT id, target, kind FROM graph.edges WHERE source = $1', [loser.id]);
        for (const edge of outEdges.rows) {
            // Check if Winner already has this edge
            const existing = await client.query(
                'SELECT id FROM graph.edges WHERE source = $1 AND target = $2 AND kind = $3',
                [winner.id, edge.target, edge.kind]
            );
            
            if (existing.rows.length > 0) {
                // Winner has it, delete duplicate from loser
                await client.query('DELETE FROM graph.edges WHERE id = $1', [edge.id]);
            } else {
                // Winner doesn't have it, move it to winner
                await client.query('UPDATE graph.edges SET source = $1 WHERE id = $2', [winner.id, edge.id]);
            }
        }

        // 2. Handle Incoming Edges (Target = Loser)
        const inEdges = await client.query('SELECT id, source, kind FROM graph.edges WHERE target = $1', [loser.id]);
        for (const edge of inEdges.rows) {
            // Check if Winner already has this edge
            const existing = await client.query(
                'SELECT id FROM graph.edges WHERE source = $1 AND target = $2 AND kind = $3',
                [edge.source, winner.id, edge.kind]
            );
            
            if (existing.rows.length > 0) {
                // Winner has it, delete duplicate from loser
                await client.query('DELETE FROM graph.edges WHERE id = $1', [edge.id]);
            } else {
                // Winner doesn't have it, move it to winner
                await client.query('UPDATE graph.edges SET target = $1 WHERE id = $2', [winner.id, edge.id]);
            }
        }

        // Delete Loser Entity
        await client.query('DELETE FROM graph.entities WHERE id = $1', [loser.id]);
        
        // Delete from Neo4j
        const session = driver.session();
        try {
            await session.run('MATCH (n) WHERE n.id = $id DETACH DELETE n', { id: loser.id });
        } finally {
            await session.close();
        }
      }
    }
  } finally {
    client.release();
  }
}

async function deduplicateOrganizations() {
  console.log('🏢 Starting Organization Deduplication...');
  const client = await pool.connect();

  try {
    // Find duplicates by name
    const duplicates = await client.query(`
      SELECT lower(name) as lname, count(*) as cnt
      FROM graph.entities
      WHERE type = 'organization'
      GROUP BY lower(name)
      HAVING count(*) > 1
    `);

    console.log(`   - Found ${duplicates.rowCount} organization names with duplicates.`);

    for (const row of duplicates.rows) {
      const name = row.lname;
      
      // Fetch all entities for this name
      const entities = await client.query(`
        SELECT id, name, business_analysis, domain, enriched, enrichment_source
        FROM graph.entities
        WHERE lower(name) = $1 AND type = 'organization'
      `, [name]);

      if (entities.rows.length < 2) continue;

      // Score them
      const scored = await Promise.all(entities.rows.map(async (e) => {
        let score = 0;
        
        // Valid Analysis
        if (e.business_analysis && !JSON.stringify(e.business_analysis).includes('Unknown')) {
            score += 10;
        }
        
        // Domain present
        if (e.domain) score += 5;
        
        // Enriched
        if (e.enriched) score += 2;

        // Edge count (check DB)
        const edges = await client.query('SELECT count(*) FROM graph.edges WHERE source = $1 OR target = $1', [e.id]);
        score += parseInt(edges.rows[0].count);

        return { ...e, score };
      }));

      // Sort desc by score
      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0];
      const losers = scored.slice(1);

      console.log(`   Processing "${winner.name}": Keeping ID ${winner.id} (Score ${winner.score}), removing ${losers.length} others.`);

      // Merge Edges from Losers to Winner
      for (const loser of losers) {
        // 1. Handle Outgoing Edges (Source = Loser)
        const outEdges = await client.query('SELECT id, target, kind FROM graph.edges WHERE source = $1', [loser.id]);
        for (const edge of outEdges.rows) {
            const existing = await client.query(
                'SELECT id FROM graph.edges WHERE source = $1 AND target = $2 AND kind = $3',
                [winner.id, edge.target, edge.kind]
            );
            if (existing.rows.length > 0) {
                await client.query('DELETE FROM graph.edges WHERE id = $1', [edge.id]);
            } else {
                await client.query('UPDATE graph.edges SET source = $1 WHERE id = $2', [winner.id, edge.id]);
            }
        }

        // 2. Handle Incoming Edges (Target = Loser)
        const inEdges = await client.query('SELECT id, source, kind FROM graph.edges WHERE target = $1', [loser.id]);
        for (const edge of inEdges.rows) {
            const existing = await client.query(
                'SELECT id FROM graph.edges WHERE source = $1 AND target = $2 AND kind = $3',
                [edge.source, winner.id, edge.kind]
            );
            if (existing.rows.length > 0) {
                await client.query('DELETE FROM graph.edges WHERE id = $1', [edge.id]);
            } else {
                await client.query('UPDATE graph.edges SET target = $1 WHERE id = $2', [winner.id, edge.id]);
            }
        }

        // Delete Loser Entity
        await client.query('DELETE FROM graph.entities WHERE id = $1', [loser.id]);
        
        // Delete from Neo4j
        const session = driver.session();
        try {
            await session.run('MATCH (n) WHERE n.id = $id DETACH DELETE n', { id: loser.id });
        } finally {
            await session.close();
        }
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await cleanGarbage();
    await deduplicatePeople();
    await deduplicateOrganizations();
    console.log('✅ Systematic Cleanup Complete.');
  } catch (err) {
    console.error('Cleanup Failed:', err);
  } finally {
    await pool.end();
    await driver.close();
  }
}

main();

