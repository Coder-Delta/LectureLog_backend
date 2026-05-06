import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkAttendance() {
  try {
    const res = await pool.query("SELECT * FROM attendance WHERE student_id = 10 ORDER BY marked_at DESC LIMIT 5");
    console.log('Attendance for student 10:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAttendance();
