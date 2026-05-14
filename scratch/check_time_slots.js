import pool from '../src/config/database.config.js';

async function check() {
  try {
    const res = await pool.query('SELECT * FROM time_slots');
    console.log('Time Slots count:', res.rows.length);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
