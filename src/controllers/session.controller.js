import pool from '../config/database.config.js';

export const startSession = async (req, res) => {
  const { subject_id, classroom_id, duration } = req.body;
  const teacher_id = req.user?.id; // Get logged in teacher

  try {
    const start_time = new Date();
    const end_time = new Date(start_time.getTime() + (duration || 60) * 60000);

    const result = await pool.query(
      'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [subject_id, classroom_id, teacher_id, start_time, end_time, 'active']
    );
    const sessionId = result.rows[0].id;
    
    // Notify clients via socket
    const io = req.app.get('io');
    io.emit('session_started', {
      id: sessionId,
      subject_id,
      classroom_id,
      teacher_id,
      start_time,
      end_time
    });

    res.status(201).json({ message: 'Session started', sessionId });
  } catch (err) {
    console.error('Session Start Error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const endSession = async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('UPDATE sessions SET status = $1 WHERE id = $2', ['ended', id]);
    
    const io = req.app.get('io');
    io.emit('session_ended', { id });

    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSessions = async (req, res) => {
  try {
    const { rows: sessions } = await pool.query(`
      SELECT s.*, sub.name as subject_name, c.camera_url 
      FROM sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      ORDER BY s.start_time DESC
    `);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
