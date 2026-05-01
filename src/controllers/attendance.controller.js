import pool from '../config/database.config.js';

export const getSessionAttendance = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: attendance } = await pool.query(`
      SELECT a.*, s.name as student_name, s.email
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE a.session_id = $1
    `, [id]);
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getStudentAttendance = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: attendance } = await pool.query(`
      SELECT a.*, s.start_time, sub.name as subject_name
      FROM attendance a
      JOIN sessions s ON a.session_id = s.id
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE a.student_id = $1
      ORDER BY s.start_time DESC
    `, [id]);
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const markManualAttendance = async (req, res) => {
  const { student_id, session_id, status } = req.body;
  try {
    await pool.query(
      `INSERT INTO attendance (student_id, session_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, session_id) DO UPDATE SET status = EXCLUDED.status`,
      [student_id, session_id, status || 'present']
    );
    res.json({ message: 'Attendance updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
