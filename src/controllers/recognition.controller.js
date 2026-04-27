import pool from '../config/database.config.js';

export const processRecognition = async (req, res) => {
  const { student_id, session_id, confidence } = req.body;

  try {
    let sessionId = session_id;

    // 1. If session_id is 'active', find the first currently running session
    if (session_id === 'active') {
      const { rows: activeSessions } = await pool.query('SELECT id FROM sessions WHERE status = $1 LIMIT 1', ['active']);
      if (activeSessions.length === 0) {
        return res.status(400).json({ message: 'No active session found' });
      }
      sessionId = activeSessions[0].id;
    } else {
      // Validate specific session
      const { rows: sessions } = await pool.query('SELECT * FROM sessions WHERE id = $1 AND status = $2', [session_id, 'active']);
      if (sessions.length === 0) {
        return res.status(400).json({ message: 'Session not active or not found' });
      }
    }

    // 2. Check if already marked present
    const { rows: existing } = await pool.query('SELECT * FROM attendance WHERE student_id = $1 AND session_id = $2', [student_id, sessionId]);
    if (existing.length > 0) {
      return res.json({ message: 'Attendance already marked' });
    }

    // 3. Mark attendance
    await pool.query('INSERT INTO attendance (student_id, session_id, status) VALUES ($1, $2, $3)', [student_id, sessionId, 'present']);

    // 4. Notify dashboard
    const { rows: student } = await pool.query('SELECT name FROM students WHERE id = $1', [student_id]);
    const io = req.app.get('io');
    io.emit('attendance_update', {
      student_id,
      student_name: student[0]?.name || 'Unknown',
      session_id: sessionId,
      timestamp: new Date()
    });

    res.status(201).json({ message: 'Attendance marked successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
