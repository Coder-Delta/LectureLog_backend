import pool from './src/config/database.config.js';

async function cleanup() {
  try {
    const res = await pool.query("DELETE FROM classrooms WHERE organization_id IS NULL");
    console.log(`Deleted ${res.rowCount} old classrooms with NULL organization_id`);
    
    const res2 = await pool.query("DELETE FROM subjects WHERE organization_id IS NULL");
    console.log(`Deleted ${res2.rowCount} old subjects with NULL organization_id`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

cleanup();
