import pool from './src/config/database.config.js';

async function isolate() {
  const client = await pool.connect();
  try {
    console.log('Starting Isolation Refactor...');
    await client.query('BEGIN');

    // 1. Add organization_id to core resource tables
    await client.query('ALTER TABLE subjects ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
    await client.query('ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
    
    // 2. Remove global unique constraints (they must be unique only within an org now)
    await client.query('ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_key');
    await client.query('ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_code_key');
    await client.query('ALTER TABLE classrooms DROP CONSTRAINT IF EXISTS classrooms_name_key');
    
    // 3. Add scoped unique constraints
    await client.query('ALTER TABLE subjects ADD CONSTRAINT subjects_org_name_unique UNIQUE (name, organization_id)');
    await client.query('ALTER TABLE subjects ADD CONSTRAINT subjects_org_code_unique UNIQUE (code, organization_id)');
    await client.query('ALTER TABLE classrooms ADD CONSTRAINT classrooms_org_name_unique UNIQUE (name, organization_id)');

    await client.query('COMMIT');
    console.log('SUCCESS: Resource tables are now isolated by organization.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED: Could not isolate tables:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

isolate();
