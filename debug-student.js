import pool from './src/config/database.config.js';

async function checkStudent() {
  try {
    const res = await pool.query("SELECT id, name, email, year, stream FROM students WHERE email = 'anish@gmail.com'");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkStudent();
