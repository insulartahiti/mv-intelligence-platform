require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function test() {
  try {
    console.log('Connecting...')
    const res = await pool.query('SELECT count(*) FROM graph.entities WHERE business_analysis IS NULL')
    console.log('Pending Count:', res.rows[0].count)
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await pool.end()
  }
}

test()
