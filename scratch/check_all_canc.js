import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkAll() {
  try {
    const res = await pool.query(`
      SELECT cc.*, s.subject_id, sub.name as subject_name 
      FROM cancelled_classes cc
      JOIN schedules s ON cc.schedule_id = s.id
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE cc.cancel_date = CURRENT_DATE
    `);
    console.log('All cancellations today:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAll();
