import pool from './src/config/database.config.js';

async function testInsert() {
  try {
    const istDateStr = '2026-05-10';
    const schedule = {
      id: 81,
      subject_id: 55,
      classroom_id: 57,
      teacher_id: 8,
      start_time: '21:05:00',
      end_time: '21:55:00',
      year: '2',
      stream: 'CSE'
    };

    const startStr = `${istDateStr}T${schedule.start_time}+05:30`;
    const endStr = `${istDateStr}T${schedule.end_time}+05:30`;

    console.log(`Starting session at ${startStr}`);

    const result = await pool.query(
      'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, schedule_id, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [schedule.subject_id, schedule.classroom_id, schedule.teacher_id, startStr, endStr, 'active', schedule.year, schedule.stream, schedule.id, false]
    );

    console.log(`Session started with ID: ${result.rows[0].id}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testInsert();
