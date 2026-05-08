const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'LectureLog', password: '@anish321@', port: 5432
});

async function run() {
  await pool.query(`INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, is_custom) VALUES (3, 20, 2, '2026-05-08T04:45:00.000Z', '2026-05-08T05:35:00.000Z', 'scheduled', '1', 'CSE', true)`);
  console.log('Inserted');
  pool.end();
}
run();
