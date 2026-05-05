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
  if (!id) return res.status(400).json({ message: 'Session ID is required' });

  try {
    console.log(`[HardDelete] Physically removing session ID: ${id}`);

    // 1. Hard delete from database
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // 2. Immediate Broadcast to Dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('session_ended', { id });
    }

    res.json({ message: 'Session deleted from database', id });
  } catch (err) {
    console.error('[HardDelete Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const endBySchedule = async (req, res) => {
  const { schedule_id } = req.body;
  try {
    console.log(`[DeepDelete] Physically removing all sessions for schedule: ${schedule_id}`);

    // Hard delete any active sessions for this schedule
    const { rows: deleted } = await pool.query(
      "DELETE FROM sessions WHERE schedule_id = $1 RETURNING id",
      [schedule_id]
    );

    const io = req.app.get('io');
    if (io && deleted.length > 0) {
      deleted.forEach(s => io.emit('session_ended', { id: s.id }));
    }

    res.json({ message: 'Sessions physically deleted', count: deleted.length });
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
  const io = req.app.get('io');

  try {
    // ── STEP 1: Auto-Start/End Maintenance ──
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTimeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Mark past-due active sessions as ended and notify frontend
    // We use a robust time-string comparison to avoid timezone "Ghost Sessions"
    const { rows: endingSessions } = await pool.query(`
      UPDATE sessions 
      SET status = 'ended' 
      WHERE status = 'active' 
        AND (
          end_time <= $1 -- Absolute time check
          OR (is_custom = false AND (TO_CHAR(end_time, 'HH24:MI:SS') < $2)) -- Routine time check
        )
      RETURNING id
    `, [now, currentTimeStr]);

    if (io && endingSessions.length > 0) {
      endingSessions.forEach(sess => {
        io.emit('session_ended', { id: sess.id });
        console.log(`[AUTO-END] Session ${sess.id} cleaned up.`);
      });
    }

    // 2. Check routine for current sessions
    const { rows: currentRoutine } = await pool.query(`
      SELECT s.*, sub.name as subject_name, c.name as classroom_name 
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      WHERE s.day_of_week = $1 
        AND s.start_time <= $2::time 
        AND s.end_time > $2::time
    `, [currentDay, currentTimeStr]);

    for (const routine of currentRoutine) {
      // Check if this routine session is already 'active' in the sessions table for today
      const { rows: existing } = await pool.query(`
        SELECT id FROM sessions 
        WHERE subject_id = $1 AND classroom_id = $2 
          AND start_time::date = CURRENT_DATE 
          AND (start_time::time)::text LIKE $3 || '%'
          AND status = 'active'
      `, [routine.subject_id, routine.classroom_id, routine.start_time]);

      if (existing.length === 0) {
        // AUTO-START: Create the active session record using pure SQL date math
        const { rows: inserted } = await pool.query(`
          INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, is_custom)
          VALUES ($1, $2, $3, (CURRENT_DATE + $4::time), (CURRENT_DATE + $5::time), 'active', $6, $7, false)
          RETURNING *
        `, [routine.subject_id, routine.classroom_id, routine.teacher_id, routine.start_time, routine.end_time, routine.year, routine.stream]);

        if (io) {
          io.emit('session_started', {
            ...inserted[0],
            subject_name: routine.subject_name,
            classroom_name: routine.classroom_name
          });
          console.log(`[AUTO-START] Activated routine session: ${routine.subject_name}`);
        }
      }
    }

    // ── STEP 2: Fetch and Return All Sessions ──
    let sessionQuery = `
      SELECT s.*, sub.name as subject_name, c.camera_url, c.name as classroom_name, u.name as teacher_name
      FROM sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE (s.status = 'active' OR s.status = 'scheduled' OR (s.status = 'ended' AND s.end_time >= CURRENT_DATE))
    `;
    const sessionParams = [];
    if (year) {
      sessionParams.push(year);
      sessionQuery += ` AND s.year = $${sessionParams.length}`;
    }
    if (stream) {
      sessionParams.push(stream);
      sessionQuery += ` AND s.stream = $${sessionParams.length}`;
    }

    const { rows: dbSessions } = await pool.query(sessionQuery, sessionParams);

    // ── STEP 3: Fetch Today's Routine (Schedules) ──
    let scheduleQuery = `
      SELECT s.*, sub.name as subject_name, c.name as classroom_name, u.name as teacher_name
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      JOIN users u ON s.teacher_id = u.id
      WHERE s.day_of_week = $1
    `;
    const scheduleParams = [currentDay];
    if (year) {
      scheduleParams.push(year);
      scheduleQuery += ` AND s.year = $${scheduleParams.length}`;
    }
    if (stream) {
      scheduleParams.push(stream);
      scheduleQuery += ` AND s.stream = $${scheduleParams.length}`;
    }

    const { rows: todayRoutine } = await pool.query(scheduleQuery, scheduleParams);

    // Convert Routine to Session format and Filter out already active ones
    const upcomingRoutine = todayRoutine
      .filter(routine => {
        // Only include routine if it hasn't passed and doesn't have an active/scheduled session already
        const routineEndTime = routine.end_time;
        if (routineEndTime < currentTimeStr) return false;

        const alreadyExists = dbSessions.some(sess => 
          !sess.is_custom && 
          sess.subject_id === routine.subject_id && 
          sess.classroom_id === routine.classroom_id &&
          sess.teacher_id === routine.teacher_id &&
          (sess.status === 'active' || sess.status === 'scheduled')
        );
        return !alreadyExists;
      })
      .map(routine => ({
        id: `routine_${routine.id}`,
        subject_id: routine.subject_id,
        classroom_id: routine.classroom_id,
        teacher_id: routine.teacher_id,
        subject_name: routine.subject_name,
        classroom_name: routine.classroom_name,
        teacher_name: routine.teacher_name,
        start_time: routine.start_time,
        end_time: routine.end_time,
        year: routine.year,
        stream: routine.stream,
        status: 'scheduled',
        is_custom: false
      }));

    // ── STEP 4: Merge and Audit ──
    const allSessions = [...dbSessions, ...upcomingRoutine];

    // Final Guard Auditor
    const finalSessions = allSessions.map(s => {
      if (s.status === 'active') {
        const sessionEnd = new Date(s.end_time);
        // If it's a real timestamp, compare normally. If it's a routine string, compare string
        const isPast = typeof s.end_time === 'string' 
          ? s.end_time < currentTimeStr 
          : now > sessionEnd;
          
        if (isPast) {
          if (!String(s.id).startsWith('routine_')) {
            pool.query("UPDATE sessions SET status = 'ended' WHERE id = $1", [s.id]).catch(e => {});
            if (io) io.emit('session_ended', { id: s.id });
          }
          return { ...s, status: 'ended' };
        }
      }
      return s;
    }).filter(s => s.status !== 'ended'); // Don't return ended ones for the live dashboard

    // Priority Sorting: Active first, then by start_time
    finalSessions.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      
      const aTime = String(a.start_time);
      const bTime = String(b.start_time);
      return aTime.localeCompare(bTime);
    });

    res.json(finalSessions);
  } catch (err) {
    console.error('[getSessions Maintenance Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};
