import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkStudents() {
  try {
    const res = await pool.query("SELECT id, name, year, stream, face_embedding IS NOT NULL as has_embedding FROM users WHERE role = 'student' AND year = '2' AND stream = 'CSE'");
    console.log('Students in Year 2 CSE:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkStudents();
