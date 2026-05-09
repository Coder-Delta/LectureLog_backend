import pool from './src/config/database.config.js';

async function cleanup() {
  try {
    const slugs = ['gmit-001', 'gmit-002'];
    console.log('Cleaning up organizations:', slugs);
    
    const orgsRes = await pool.query('SELECT id FROM organizations WHERE slug = ANY($1)', [slugs]);
    const ids = orgsRes.rows.map(r => r.id);
    
    if (ids.length === 0) {
      console.log('No organizations found with those slugs.');
      return;
    }
    
    console.log('Found IDs:', ids);
    
    // Delete associated data first
    await pool.query('DELETE FROM users WHERE organization_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM students WHERE organization_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM organizations WHERE id = ANY($1)', [ids]);
    
    console.log('SUCCESS: Deleted organizations and all associated users/students.');
  } catch (err) {
    console.error('ERROR during cleanup:', err);
  } finally {
    process.exit(0);
  }
}

cleanup();
