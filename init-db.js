import pool from './src/config/database.config.js';

const initDb = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database.');

    await connection.query(`CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      roll_number VARCHAR(50) UNIQUE,
      college_id VARCHAR(100) UNIQUE,
      year INT,
      image_url VARCHAR(255),
      status ENUM('active', 'inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('teacher', 'admin') DEFAULT 'teacher',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS subjects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS classrooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      camera_url VARCHAR(255) NOT NULL
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subject_id INT,
      classroom_id INT,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      status ENUM('active', 'ended') DEFAULT 'active',
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT,
      session_id INT,
      status ENUM('present', 'absent') DEFAULT 'present',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS recheck_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT,
      session_id INT,
      message TEXT,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subject_id INT,
      classroom_id INT,
      day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    )`);

    // Add default data for quick start
    await connection.execute('INSERT IGNORE INTO subjects (id, name) VALUES (1, "General Class")');
    await connection.execute('INSERT IGNORE INTO classrooms (id, camera_url) VALUES (1, "0")');

    console.log('Database tables initialized successfully.');
    connection.release();
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
};

initDb();
