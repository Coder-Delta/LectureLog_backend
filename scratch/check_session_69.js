import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'Merge',
  port: 5432
});

async function checkSession() {
  try {
    const res = await pool.query("SELECT s.*, sub.name as subject_name FROM sessions s JOIN subjects sub ON s.subject_id = sub.id WHERE s.id = 69");
    console.log('Session 69:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSession();
