import pool from '../config/database.config.js';

export const getSessionAttendance = async (req, res) => {
  const { id } = req.params;
  const includeAbsent = req.query.include_absent === 'true';
  try {
    if (String(id).startsWith('routine_') || String(id).startsWith('sched_')) {
      return res.json([]);
    }

    if (includeAbsent) {
      const { rows: sessionRows } = await pool.query('SELECT year, stream FROM sessions WHERE id = $1', [id]);
      if (sessionRows.length === 0) return res.status(404).json({ message: 'Session not found' });

      const session = sessionRows[0];
      const { rows: roster } = await pool.query(`
        SELECT
          st.id as student_id,
          st.name as student_name,
          st.email,
          st.roll_number,
          st.image_url,
          COALESCE(a.status, 'absent') as status,
          a.marked_at,
          a.session_id
        FROM students st
        LEFT JOIN attendance a
          ON a.student_id = st.id
          AND a.session_id = $1
        WHERE st.year::text = $2::text
          AND st.stream = $3
        ORDER BY st.roll_number, st.name
      `, [id, session.year, session.stream]);

      return res.json(roster);
    }

    const { rows: attendance } = await pool.query(`
      SELECT a.*, s.name as student_name, s.email, s.roll_number, s.image_url
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE a.session_id = $1
      ORDER BY a.marked_at DESC
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
      SELECT a.*, s.start_time, sub.name as subject_name, s.subject_id
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

// trigger nodemon
