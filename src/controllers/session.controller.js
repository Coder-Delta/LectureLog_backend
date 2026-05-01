import pool from '../config/database.config.js';

export const startSession = async (req, res) => {
  const { subject_id, classroom_id, duration, year, stream } = req.body;
  const teacher_id = req.user?.id;

  try {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];

    const start_time = req.body.start_time ? new Date(req.body.start_time) : new Date();
    const end_time = req.body.end_time ? new Date(req.body.end_time) : new Date(start_time.getTime() + (duration || 60) * 60000);
    const startStr = start_time.toTimeString().split(' ')[0];

    // 1. Check for overlapping custom sessions
    const { rows: overlappingSessions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE (
          (s.classroom_id = $1 AND s.classroom_id IS NOT NULL) OR 
          s.teacher_id = $2 OR 
          (s.year = $3 AND s.stream = $4)
        )
        AND s.start_time < ($5::timestamp - interval '1 second')
        AND s.end_time > ($6::timestamp + interval '1 second')
        AND s.status IN ('active', 'scheduled')
    `, [classroom_id, teacher_id, year, stream, end_time, start_time]);

    if (overlappingSessions.length > 0) {
      const collision = overlappingSessions[0];
      let reason = 'Student Group (Year/Stream)';

      if (classroom_id && collision.classroom_id === parseInt(classroom_id)) {
        reason = 'Classroom';
      } else if (collision.teacher_id === parseInt(teacher_id)) {
        reason = 'Teacher';
      }

      return res.status(400).json({
        message: `Conflict! ${reason} is already occupied by ${collision.subject_name} (Year ${collision.year || 'N/A'}) during this time.`
      });
    }

    // 2. Check for collisions with Regular Schedules (Routine)
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1
        AND s.start_time <= $2::time AND s.end_time > $2::time
        AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
    `, [currentDay, startStr, classroom_id, teacher_id, year, stream]);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      if (collision.teacher_id === parseInt(teacher_id)) reason = 'Teacher';

      return res.status(400).json({
        message: `Routine Conflict! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) according to the weekly routine.`
      });
    }

    const now_ts = new Date();
    let status = 'active';
    if (now_ts < start_time) {
      status = 'scheduled';
    } else if (now >= end_time) {
      status = 'ended';
    }

    const result = await pool.query(
      'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [subject_id, classroom_id, teacher_id, start_time, end_time, status, year || null, stream || null, true]
    );
    const sessionId = result.rows[0].id;

    const io = req.app.get('io');
    io.emit('session_started', {
      id: sessionId,
      subject_id,
      classroom_id,
      teacher_id,
      start_time,
      end_time,
      year,
      stream
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

export const cancelSession = async (req, res) => {
  const { id } = req.body;
  console.log('[cancelSession] Attempting to cancel session ID:', id);
  try {
    const sessionId = parseInt(id);
    if (isNaN(sessionId)) {
      throw new Error('Invalid session ID');
    }

    await pool.query('UPDATE sessions SET status = $1 WHERE id = $2', ['cancelled', sessionId]);

    const io = req.app.get('io');
    if (io) {
      io.emit('session_cancelled', { id: sessionId });
    }

    res.json({ message: 'Session cancelled' });
  } catch (err) {
    console.error('[cancelSession Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const getSessions = async (req, res) => {
  const { year, stream } = req.query;
  try {
    let query = `
      SELECT s.*, sub.name as subject_name, c.camera_url, c.name as classroom_name, u.name as teacher_name
      FROM sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN users u ON s.teacher_id = u.id
    `;
    const params = [];
    const conditions = [];

    if (year) {
      params.push(year);
      conditions.push(`s.year = $${params.length}`);
    }
    if (stream) {
      params.push(stream);
      conditions.push(`s.stream = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY s.start_time DESC`;

    const { rows: sessions } = await pool.query(query, params);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
