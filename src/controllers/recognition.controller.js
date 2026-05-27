import pool from '../config/database.config.js';
import { getLatestAIStatus } from '../services/ai.service.js';


export const processRecognition = async (req, res) => {
  const { student_id, session_id, confidence } = req.body;

  // Server-side confidence floor — reject weak AI matches as a safety net
  const MIN_CONFIDENCE = 0.60;
  if (!confidence || confidence < MIN_CONFIDENCE) {
    return res.status(400).json({ 
      message: `Confidence too low (${(confidence || 0).toFixed(2)}). Minimum required: ${MIN_CONFIDENCE}` 
    });
  }

  try {
    let sessionId = session_id;

    // 1. If session_id is 'active', find the session matching the student's year and stream
    if (session_id === 'active') {
      // Get student details first
      const { rows: student } = await pool.query('SELECT year, stream FROM students WHERE id = $1', [student_id]);
      if (student.length === 0) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const { year, stream } = student[0];

      const { rows: activeSessions } = await pool.query(
        'SELECT id FROM sessions WHERE status = $1 AND year = $2 AND stream = $3',
        ['active', year, stream]
      );

      if (activeSessions.length === 0) {
        return res.status(400).json({ message: 'No active session found for this student group' });
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

export const getSessionAttendance = async (req, res) => {
  const { sessionId } = req.params;
  try {
    const { rows: attendance } = await pool.query(`
      SELECT a.*, s.name as student_name, s.roll_number, s.year, s.stream
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE a.session_id = $1
      ORDER BY a.marked_at DESC
    `, [sessionId]);
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getRecognitionStatus = async (req, res) => {
  try {
    const status = getLatestAIStatus();
    res.json(status || { online: false, displayStatus: 'AI Service Offline', isError: true, details: {} });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

