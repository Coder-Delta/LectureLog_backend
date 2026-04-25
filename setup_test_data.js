import pool from './src/config/database.config.js';
import bcrypt from 'bcryptjs';

const setupData = async () => {
  try {
    const connection = await pool.getConnection();

    // 1. Create a Teacher
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await connection.query(
      'INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Dr. Smith', 'smith@univ.edu', hashedPassword, 'teacher']
    );

    // 2. Create a Subject
    const [subj] = await connection.query('INSERT IGNORE INTO subjects (name) VALUES (?)', ['Computer Science 101']);
    const subjectId = subj.insertId || 1;

    // 3. Create a Classroom
    const [room] = await connection.query('INSERT IGNORE INTO classrooms (camera_url) VALUES (?)', ['rtsp://camera1.local']);
    const roomId = room.insertId || 1;

    // 4. Create a Student
    const [stud] = await connection.query('INSERT IGNORE INTO students (name, email) VALUES (?, ?)', ['John Doe', 'john@student.edu']);
    const studentId = stud.insertId || 1;

    // 5. Create an Active Session
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour from now
    const [sess] = await connection.query(
      'INSERT INTO sessions (subject_id, classroom_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)',
      [subjectId, roomId, startTime, endTime, 'active']
    );
    const sessionId = sess.insertId;

    console.log('\n--- Test Data Created ---');
    console.log(`Teacher: smith@univ.edu / admin123`);
    console.log(`Student ID: ${studentId} (John Doe)`);
    console.log(`Session ID: ${sessionId} (Active Now)`);
    console.log('-------------------------\n');

    connection.release();
    process.exit(0);
  } catch (err) {
    console.error('Error setting up data:', err);
    process.exit(1);
  }
};

setupData();
