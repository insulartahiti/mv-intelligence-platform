
import { Client } from 'pg';

const config = {
  user: 'postgres',
  password: 'nwrrhfgp4uhf1483gh74hg1ugru',
  host: 'db.uqptiychukuwixubrbat.supabase.co',
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
};

async function main() {
  const client = new Client(config);
  try {
    await client.connect();
    console.log('Connected to database');

    console.log('\n--- Checking Aufinity Entity ---');
    const entityRes = await client.query(`
      SELECT id, name, slug, is_portfolio 
      FROM graph.entities 
      WHERE name ILIKE '%aufinity%' OR slug ILIKE '%aufinity%'
    `);
    console.table(entityRes.rows);

    if (entityRes.rows.length > 0) {
      const companyId = entityRes.rows[0].id;
      console.log(`\n--- Checking Guides for Company ID: ${companyId} ---`);
      const guideRes = await client.query(`
        SELECT id, company_id, type, updated_at, substring(content_yaml from 1 for 100) as yaml_start
        FROM portfolio_guides 
        WHERE company_id = $1
      `, [companyId]);
      console.table(guideRes.rows);
    } else {
      console.log('No Aufinity entity found.');
    }

  } catch (err) {
    console.error('Database error:', err);
  } finally {
    await client.end();
  }
}

main();
