import pool from './src/config/database.config.js';

async function finalLockdown() {
  const client = await pool.connect();
  try {
    console.log('Starting Final Privacy Lockdown...');
    await client.query('BEGIN');

    // 1. Add organization_id to Schedules and Sessions
    await client.query('ALTER TABLE schedules ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
    await client.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
    
    // 2. Add organization_id to Time Slots (if not already there)
    await client.query('ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');

    await client.query('COMMIT');
    console.log('SUCCESS: All institutional data is now strictly isolated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED: Could not complete lockdown:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

finalLockdown();
