import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkSessions() {
  try {
    const res = await pool.query("SELECT * FROM sessions WHERE subject_id = 3 AND start_time::date = CURRENT_DATE");
    console.log('Sessions today for subject 3:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSessions();
