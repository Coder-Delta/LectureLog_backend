import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkSchedule() {
  try {
    const res = await pool.query('SELECT s.*, sub.name as subject_name FROM schedules s JOIN subjects sub ON s.subject_id = sub.id WHERE s.id = 37');
    console.log('Schedule 37:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchedule();
