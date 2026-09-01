import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('Running migration: Add host_code to events table...');
    
    // Run the migration SQL directly
    await pool.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS host_code VARCHAR(50) NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_events_host_code ON events(host_code);
    `);
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
