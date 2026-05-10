import pool from './src/config/database.config.js';

async function cleanup() {
  try {
    // Find duplicates for today's bangla class (schedule_id 81)
    const res = await pool.query(`
      SELECT id FROM sessions 
      WHERE schedule_id = 81 
        AND start_time::date = '2026-05-10'
      ORDER BY id DESC
    `);
    
    if (res.rows.length > 1) {
      const idToDelete = res.rows[0].id; // Delete the latest one (likely my test insert)
      await pool.query("DELETE FROM sessions WHERE id = $1", [idToDelete]);
      console.log(`Deleted duplicate session ID: ${idToDelete}`);
    } else {
      console.log("No duplicates found.");
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

cleanup();
