import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/madetogether';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: process.env.VERCEL ? 1 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
