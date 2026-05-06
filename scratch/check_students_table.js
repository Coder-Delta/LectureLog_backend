import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkStudentsInGroup() {
  try {
    const res = await pool.query("SELECT id, name, year, stream, face_embedding IS NOT NULL as has_embedding FROM students WHERE year = '2' AND stream = 'CSE'");
    console.log('Students in Year 2 CSE (students table):', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkStudentsInGroup();
