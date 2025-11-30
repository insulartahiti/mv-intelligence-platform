const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const res = await pool.query("SELECT id, name, is_portfolio, business_analysis, ai_summary FROM graph.entities WHERE name ILIKE '%Navro%' OR name ILIKE '%Paytrix%'");
  console.log(res.rows);
  pool.end();
}

check();
