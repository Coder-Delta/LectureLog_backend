import pool from '../src/config/database.config.js';

async function inspect() {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    console.log("ALL USERS:");
    console.log(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspect();
