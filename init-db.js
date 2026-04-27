import pool from './src/config/database.config.js';

const initDb = async () => {
  let client;

  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL database.');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        roll_number VARCHAR(50) UNIQUE NOT NULL,
        college_id VARCHAR(100) NOT NULL,
        year INTEGER,
        face_embedding JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (roll_number, college_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS classrooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE DEFAULT 'Main Classroom',
        camera_url VARCHAR(255) NOT NULL DEFAULT '0'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        classroom_id INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended'))
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
        marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (student_id, session_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS recheck_requests (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        year VARCHAR(1) NOT NULL DEFAULT '1' CHECK (year IN ('1', '2', '3', '4')),
        camera_id VARCHAR(50) NOT NULL DEFAULT '0'
      )
    `);

    await client.query(`
      INSERT INTO subjects (name)
      VALUES ('General Class')
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query(`
      INSERT INTO classrooms (name, camera_url)
      VALUES ('Main Classroom', '0')
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Database tables initialized successfully.');
    client.release();
    process.exit(0);
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error initializing database:', err);
    client?.release();
    process.exit(1);
  }
};

initDb();
