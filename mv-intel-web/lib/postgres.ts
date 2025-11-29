import { Pool } from 'pg';

// Use a singleton pool to prevent connection exhaustion in serverless environment
let pool: Pool | undefined;

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, // Max clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

export default pool!;

