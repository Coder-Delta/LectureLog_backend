import pool from './src/config/database.config.js';
import bcrypt from 'bcryptjs';

const setupData = async () => {
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Create a Teacher
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const teacherResult = await client.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['Dr. Smith', 'smith@univ.edu', hashedPassword, 'teacher']
    );
    const teacherId = teacherResult.rows[0].id;

    // 2. Create a Subject
    const subjectResult = await client.query(
      `INSERT INTO subjects (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['Computer Science 101']
    );
    const subjectId = subjectResult.rows[0].id;

    // 3. Create a Classroom
    const roomResult = await client.query(
      `INSERT INTO classrooms (name, camera_url)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET camera_url = EXCLUDED.camera_url
       RETURNING id`,
      ['Lab 101', 'rtsp://camera1.local']
    );
    const roomId = roomResult.rows[0].id;

    // 4. Create a Student
    const studentResult = await client.query(
      `INSERT INTO students (name, email, roll_number, college_id, year)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['John Doe', 'john@student.edu', 'CS-001', 'CLG-001', 1]
    );
    const studentId = studentResult.rows[0].id;

    // 5. Create an Active Session
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour from now
    const sessionResult = await client.query(
      `INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [subjectId, roomId, teacherId, startTime, endTime, 'active']
    );
    const sessionId = sessionResult.rows[0].id;

    await client.query('COMMIT');

    console.log('\n--- Test Data Created ---');
    console.log(`Teacher: smith@univ.edu / admin123`);
    console.log(`Student ID: ${studentId} (John Doe)`);
    console.log(`Session ID: ${sessionId} (Active Now)`);
    console.log('-------------------------\n');

    client.release();
    process.exit(0);
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    console.error('Error setting up data:', err);
    process.exit(1);
  }
};

setupData();
