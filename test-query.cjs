const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'LectureLog', password: '@anish321@', port: 5432
});

async function run() {
  const res = await pool.query("SELECT * FROM sessions WHERE is_custom = true");
  console.log(JSON.stringify(res.rows, null, 2));

  // Let's also check what gets returned by getSessions logic
  const { rows: dbSessions } = await pool.query(`
      SELECT s.id, s.subject_id, s.teacher_id, s.classroom_id, s.status, s.year, s.stream, s.is_custom, s.schedule_id,
             TO_CHAR(s.start_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             TO_CHAR(s.end_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             sub.name as subject_name, c.camera_url, c.name as classroom_name, u.name as teacher_name
      FROM sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE s.is_custom = true
  `);
  console.log("DB SESSIONS FORMATTED:");
  console.log(JSON.stringify(dbSessions, null, 2));

  pool.end();
}
run();
