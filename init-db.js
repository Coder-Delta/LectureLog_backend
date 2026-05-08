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
        college_id VARCHAR(100),
        role VARCHAR(20) NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Ensure columns exist if table was already created
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS college_id VARCHAR(100);
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cloudinary_id VARCHAR(255);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        roll_number VARCHAR(50) UNIQUE NOT NULL,
        college_id VARCHAR(100) NOT NULL,
        year INTEGER,
        stream VARCHAR(50),
        face_embedding JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (roll_number, college_id)
      )
    `);

    // Ensure the stream column exists if the table was already created
    await client.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS stream VARCHAR(50);
    `);

    await client.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);

    await client.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS cloudinary_id VARCHAR(255);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        code VARCHAR(50) UNIQUE
      )
    `);

    // Ensure the code column exists if the table was created previously without it
    await client.query(`
      ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;
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
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'ended', 'cancelled'))
      )
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sessions_status_check'
        ) THEN
          ALTER TABLE sessions DROP CONSTRAINT sessions_status_check;
        END IF;
        ALTER TABLE sessions
          ADD CONSTRAINT sessions_status_check
          CHECK (status IN ('active', 'scheduled', 'ended', 'cancelled'));
      END $$;
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
        stream VARCHAR(50) NOT NULL DEFAULT 'CSE',
        camera_id VARCHAR(50) NOT NULL DEFAULT '0'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cancelled_classes (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        cancel_date DATE NOT NULL DEFAULT CURRENT_DATE,
        UNIQUE (schedule_id, cancel_date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS timetable_week_entries (
        id SERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        entry_date DATE,
        source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('regular', 'custom')),
        source_id INTEGER,
        action VARCHAR(20) NOT NULL CHECK (action IN ('active', 'cancelled', 'deleted')),
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        classroom_id INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        year VARCHAR(1) NOT NULL DEFAULT '1' CHECK (year IN ('1', '2', '3', '4')),
        stream VARCHAR(50) NOT NULL DEFAULT 'CSE',
        camera_id VARCHAR(50) NOT NULL DEFAULT '0',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'timetable_week_entries_action_check'
        ) THEN
          ALTER TABLE timetable_week_entries DROP CONSTRAINT timetable_week_entries_action_check;
        END IF;
        ALTER TABLE timetable_week_entries
          ADD CONSTRAINT timetable_week_entries_action_check
          CHECK (action IN ('active', 'cancelled', 'deleted'));
      END $$;
    `);

    // Ensure the stream column exists in schedules if the table was already created
    await client.query(`
      ALTER TABLE schedules ADD COLUMN IF NOT EXISTS stream VARCHAR(50) NOT NULL DEFAULT 'CSE';
    `);

    await client.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS year INTEGER;
    `);

    await client.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stream VARCHAR(50);
    `);

    await client.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id SERIAL PRIMARY KEY,
        start_time VARCHAR(20) NOT NULL,
        end_time VARCHAR(20) NOT NULL,
        raw_start VARCHAR(20) NOT NULL,
        raw_end VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if time_slots has values, otherwise insert defaults
    const slotCountRes = await client.query('SELECT COUNT(*) FROM time_slots');
    if (parseInt(slotCountRes.rows[0].count) === 0) {
      const defaultSlots = [
        ['10:15 AM', '11:05 AM', '10:15:00', '11:05:00'],
        ['11:05 AM', '11:55 AM', '11:05:00', '11:55:00'],
        ['11:55 AM', '12:45 PM', '11:55:00', '12:45:00'],
        ['12:45 PM', '01:35 PM', '12:45:00', '13:35:00'],
        ['01:35 PM', '02:25 PM', '13:35:00', '14:25:00'],
        ['02:25 PM', '03:15 PM', '14:25:00', '15:15:00'],
        ['03:15 PM', '04:05 PM', '15:15:00', '16:05:00'],
        ['04:05 PM', '04:55 PM', '16:05:00', '16:55:00'],
        ['04:55 PM', '05:45 PM', '16:55:00', '17:45:00']
      ];

      for (const slot of defaultSlots) {
        await client.query(
          'INSERT INTO time_slots (start_time, end_time, raw_start, raw_end) VALUES ($1, $2, $3, $4)',
          slot
        );
      }
    }

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
