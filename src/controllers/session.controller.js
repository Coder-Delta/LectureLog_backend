import pool from '../config/database.config.js';
import axios from 'axios';
import bcrypt from 'bcryptjs';

// ── Helper: Get start and end of the CURRENT week (Mon–Sun) ──────────────────
const getCurrentWeekRange = (value = null) => {
  const now = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { startOfWeek: monday, endOfWeek: sunday };
};

// ── Helper: Finalize Session (Mark ended and fill absent records) ──────────────
export const finalizeSession = async (sessionId, io = null) => {
  try {
    console.log(`[Finalizer] Finalizing session ID: ${sessionId}`);
    
    // 1. Mark session as ended
    const { rows: sessions } = await pool.query(
      "UPDATE sessions SET status = 'ended' WHERE id = $1 RETURNING *",
      [sessionId]
    );
    
    if (sessions.length === 0) return;
    const session = sessions[0];
    
    // 2. Identify students who should have been present (Roster)
    if (session.year && session.stream) {
      const { rows: roster } = await pool.query(
        "SELECT id FROM students WHERE year::text = $1::text AND LOWER(stream) = LOWER($2) AND status = 'active'",
        [session.year, session.stream]
      );
      
      if (roster.length > 0) {
        // 3. Mark all missing students as 'absent'
        // ON CONFLICT DO NOTHING ensures we don't overwrite 'present' records
        const valueStrings = roster.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
        const flatValues = roster.flatMap(s => [s.id, sessionId, 'absent']);
        
        await pool.query(`
          INSERT INTO attendance (student_id, session_id, status)
          VALUES ${valueStrings}
          ON CONFLICT (student_id, session_id) DO NOTHING
        `, flatValues);
        
        console.log(`[Finalizer] Session ${sessionId} finalized. Roster size: ${roster.length}. Attendance state preserved.`);
      }
    }
    
    if (io) {
      io.emit('session_ended', { id: sessionId });
    }
    return true;
  } catch (err) {
    console.error(`[Finalizer Error] Session ${sessionId}:`, err.message);
    return false;
  }
};

export const startSession = async (req, res) => {
  const { subject_id, classroom_id, duration, year, stream } = req.body;
  const teacher_id = req.user?.id;

  try {
    const start_time = req.body.start_time ? new Date(req.body.start_time) : new Date();
    const end_time = req.body.end_time ? new Date(req.body.end_time) : new Date(start_time.getTime() + (duration || 60) * 60000);
    
    // Day of the week for the specific date provided
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sessionDay = days[start_time.getDay()];
    const startStr = start_time.toTimeString().split(' ')[0];

    // 0. Validation: Cannot add a session that has already passed
    const now_ts = new Date();
    if (now_ts > end_time) {
      return res.status(400).json({
        message: 'The selected time has already passed. Please choose another time slot for today or a future date.'
      });
    }

    // 1. Check for overlapping custom sessions (active or scheduled)
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

    // 2. Check for collisions with Regular Schedules (Routine) for THAT SPECIFIC DAY
    // We ignore routine slots that are officially CANCELLED for this specific date
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN cancelled_classes cc ON s.id = cc.schedule_id AND cc.cancel_date = $7::date
      WHERE s.day_of_week = $1
        AND s.start_time <= $2::time AND s.end_time > $2::time
        AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
        AND cc.id IS NULL
    `, [sessionDay, startStr, classroom_id, teacher_id, year, stream, start_time]);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      if (collision.teacher_id === parseInt(teacher_id)) reason = 'Teacher';

      return res.status(400).json({
        message: `Routine Conflict! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) according to the weekly routine.`
      });
    }

    // Determine status: active if now is within window, scheduled if future
    let status = 'active';
    if (now_ts < start_time) {
      status = 'scheduled';
    }

    const result = await pool.query(
      'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [subject_id, classroom_id, teacher_id, start_time, end_time, status, year || null, stream || null, true]
    );
    const sessionId = result.rows[0].id;

    // Fetch names for the broadcast
    const { rows: meta } = await pool.query(`
      SELECT sub.name as subject_name, c.name as classroom_name, c.camera_name, c.camera_url, u.name as teacher_name
      FROM subjects sub, classrooms c, users u
      WHERE sub.id = $1 AND c.id = $2 AND u.id = $3
    `, [subject_id, classroom_id, teacher_id]);

    const io = req.app.get('io');
    io.emit('session_started', {
      id: sessionId,
      subject_id,
      classroom_id,
      teacher_id,
      start_time,
      end_time,
      year,
      stream,
      is_custom: true,
      status,
      subject_name: meta[0]?.subject_name,
      classroom_name: meta[0]?.classroom_name,
      camera_name: meta[0]?.camera_name,
      camera_url: meta[0]?.camera_url,
      teacher_name: meta[0]?.teacher_name
    });

    // Notify AI service to refresh and start scanning immediately
    axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(e => console.warn('AI Refresh failed on session start'));

    res.status(201).json({ message: 'Custom session added successfully', sessionId });
  } catch (err) {
    console.error('Session Start Error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const endSession = async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'Session ID is required' });

  try {
    console.log(`[EndSession] Marking session ID ${id} as ended`);

    const result = await finalizeSession(id, req.app.get('io'));

    if (!result) {
      return res.status(404).json({ message: 'Session not found or already finalized' });
    }

    // 2. Immediate Broadcast to Dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('session_ended', { id });
    }

    res.json({ message: 'Session ended', id });
  } catch (err) {
    console.error('[EndSession Error]:', err.message);
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

    // Call finalizer for each session to ensure attendance is saved before "removal"
    for (const sess of deleted) {
      await finalizeSession(sess.id, io);
    }

    res.json({ message: 'Sessions marked as ended and finalized', count: deleted.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const cancelSession = async (req, res) => {
  const { id, password } = req.body;
  const teacher_id = req.user.id;
  try {
    const sessionId = parseInt(id);
    const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Session not found' });
    const session = rows[0];

    // Only custom sessions can be cancelled via this endpoint
    if (!session.is_custom) {
      return res.status(400).json({ message: 'Only custom sessions can be cancelled this way.' });
    }

    // RESTRICTION: Future Week Delete Logic
    const { startOfWeek, endOfWeek } = getCurrentWeekRange();
    const sessionStart = new Date(session.start_time);
    
    if (sessionStart > endOfWeek && req.user?.role !== 'admin') {
      return res.status(400).json({ 
        message: 'This session belongs to a future week and cannot be deleted until that week becomes active.' 
      });
    }

    // Verify password
    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1', [teacher_id]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    
    const isMatch = await bcrypt.compare(password, users[0].password);
    if (!isMatch) {
      return res.status(403).json({ message: 'Invalid password. Cancellation denied.' });
    }

    // Mark custom session as 'cancelled' (not just physical delete)
    await pool.query("UPDATE sessions SET status = 'cancelled' WHERE id = $1", [sessionId]);

    const io = req.app.get('io');
    if (io) io.emit('session_ended', { id: sessionId });

    res.json({ message: 'Custom session deleted successfully' });
  } catch (err) {
    console.error('[cancelSession Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const getSessions = async (req, res) => {
  const { year, stream, allCustom, week_start } = req.query; // allCustom=true → Sessions page: show all future custom sessions
  const io = req.app.get('io');

  try {
    // ── STEP 1: Auto-Start/End Maintenance ──
    // Force India Standard Time (IST) for session activation logic
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTimeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS (in IST)

    // 1. Mark custom sessions that have ended as 'ended' (instead of deleting)
    const { rows: expiredCustomSessions } = await pool.query(`
      UPDATE sessions
      SET status = 'ended'
      WHERE is_custom = true
        AND status IN ('active', 'scheduled')
        AND end_time <= $1
      RETURNING id
    `, [now]);

    if (expiredCustomSessions.length > 0) {
      for (const sess of expiredCustomSessions) {
        await finalizeSession(sess.id, io);
      }
    }

    // 2. Mark past-due NON-custom active sessions as ended and notify frontend
    const { rows: endingSessions } = await pool.query(`
      UPDATE sessions 
      SET status = 'ended' 
      WHERE status = 'active' 
        AND is_custom = false
        AND (
          end_time <= $1
          OR (TO_CHAR(end_time, 'HH24:MI:SS') < $2)
        )
      RETURNING id
    `, [now, currentTimeStr]);

    if (endingSessions.length > 0) {
      for (const sess of endingSessions) {
        await finalizeSession(sess.id, io);
      }
    }

    // 3. Check timetable for current sessions and auto-start them
    const { rows: currentRoutine } = await pool.query(`
      SELECT t.*, sub.name as subject_name, c.name as classroom_name 
      FROM timetable_week_entries t
      JOIN subjects sub ON t.subject_id = sub.id
      JOIN classrooms c ON t.classroom_id = c.id
      WHERE t.day_of_week = $1 
        AND t.start_time <= $2::time 
        AND t.end_time > $2::time
        AND t.action = 'active'
        AND t.week_start <= CURRENT_DATE 
        AND (t.week_start + interval '6 days') >= CURRENT_DATE
    `, [currentDay, currentTimeStr]);

    for (const routine of currentRoutine) {
      const { rows: existing } = await pool.query(`
        SELECT id FROM sessions 
        WHERE subject_id = $1 AND classroom_id = $2 
          AND start_time::date = CURRENT_DATE 
          AND (start_time::time)::text LIKE $3 || '%'
          AND status = 'active'
      `, [routine.subject_id, routine.classroom_id, routine.start_time]);

      if (existing.length === 0) {
        const { rows: inserted } = await pool.query(`
          INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, is_custom)
          VALUES ($1, $2, $3, 
            (CURRENT_DATE + $4::time)::timestamp, 
            (CURRENT_DATE + $5::time)::timestamp, 
            'active', $6, $7, false)
          RETURNING *
        `, [routine.subject_id, routine.classroom_id, routine.teacher_id, routine.start_time, routine.end_time, routine.year, routine.stream]);

        if (io) {
          io.emit('session_started', {
            ...inserted[0],
            subject_name: routine.subject_name,
            classroom_name: routine.classroom_name
          });
          console.log(`[AUTO-START] Activated routine session: ${routine.subject_name}`);
          
          // Notify AI service
          axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(e => {});
        }
      }
    }

    // ── STEP 2: Fetch and Return All Sessions ──
    const { startOfWeek, endOfWeek } = getCurrentWeekRange(week_start);

    // Build custom session date condition based on allCustom flag:
    // allCustom=true (Sessions page) → show ALL sessions (past/future/ended) for history
    // allCustom=false (Timetable/Dashboard) → only current week active/scheduled
    const customDateClause = allCustom === 'true'
      ? `TRUE` // Don't filter by date for history
      : `s.start_time >= $1 AND s.start_time <= $2`; 

    const statusClause = allCustom === 'true' || week_start
      ? `s.status IN ('active', 'scheduled', 'ended', 'cancelled')`
      : `s.status IN ('active', 'scheduled', 'ended')`; // Include 'ended' for dashboard view

    const sessionParams = allCustom === 'true' ? [] : [startOfWeek, endOfWeek];

    let sessionQuery = `
      SELECT s.id, s.subject_id, s.teacher_id, s.classroom_id, s.status, s.year, s.stream, s.is_custom, s.schedule_id,
             TO_CHAR(s.start_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             TO_CHAR(s.end_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             sub.name as subject_name, c.camera_url, c.camera_name, c.name as classroom_name, u.name as teacher_name
      FROM sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE (
        (s.is_custom = false AND ${statusClause})
        OR
        (s.is_custom = true AND ${statusClause} AND ${customDateClause})
      )
    `;

    if (year) {
      sessionParams.push(year);
      sessionQuery += ` AND s.year = $${sessionParams.length}`;
    }
    if (stream) {
      sessionParams.push(stream);
      sessionQuery += ` AND s.stream = $${sessionParams.length}`;
    }

    const { rows: dbSessions } = await pool.query(sessionQuery, sessionParams);

    // ── STEP 3: Fetch Today's Routine (from Timetable entries) ──
    // We query timetable_week_entries to match exactly what is shown on the Timetable page
    let scheduleQuery = `
      SELECT t.*, sub.name as subject_name, c.name as classroom_name, c.camera_name, c.camera_url, u.name as teacher_name,
             false as is_cancelled
      FROM timetable_week_entries t
      JOIN subjects sub ON t.subject_id = sub.id
      LEFT JOIN classrooms c ON t.classroom_id = c.id
      LEFT JOIN users u ON t.teacher_id = u.id
      WHERE t.day_of_week = $1 
      AND t.action = 'active'
      AND t.week_start <= CURRENT_DATE 
      AND (t.week_start + interval '6 days') >= CURRENT_DATE
    `;
    const scheduleParams = [currentDay];
    if (year) {
      scheduleParams.push(year);
      scheduleQuery += ` AND t.year = $${scheduleParams.length}`;
    }
    if (stream) {
      scheduleParams.push(stream);
      scheduleQuery += ` AND t.stream = $${scheduleParams.length}`;
    }

    const { rows: todayRoutine } = await pool.query(scheduleQuery, scheduleParams);

    // Convert Routine to Session format and Filter out already active ones
    const upcomingRoutine = todayRoutine
      .filter(routine => {
        const routineEndTime = routine.end_time;
        const isPast = routineEndTime < currentTimeStr;
        
        // If it's in the past and we're NOT on the history/allCustom page, 
        // we only show it if a real session was recorded (handled by dbSessions).
        // On the Sessions page (allCustom), we show even the 'missed' routine slots for the day.
        if (isPast && allCustom !== 'true') return false;

        const alreadyExists = dbSessions.some(sess => {
          const sessTime = new Date(sess.start_time).toLocaleTimeString('en-GB', { hour12: false });
          // Handle both TIME string and TIMESTAMPTZ
          const routineTime = routine.start_time.includes(':') ? routine.start_time : new Date(routine.start_time).toLocaleTimeString('en-GB', { hour12: false });
          
          return !sess.is_custom && 
            sess.subject_id === routine.subject_id && 
            sess.classroom_id === routine.classroom_id &&
            sess.teacher_id === routine.teacher_id &&
            sessTime.startsWith(routine.start_time.substring(0, 5)) &&
            (sess.status === 'active' || sess.status === 'scheduled' || sess.status === 'ended' || sess.status === 'cancelled');
        });
        return !alreadyExists;
      })
      .map(routine => {
        const isPast = routine.end_time < currentTimeStr;
        return {
          id: `routine_${routine.id}`,
          subject_id: routine.subject_id,
          classroom_id: routine.classroom_id,
          teacher_id: routine.teacher_id,
          subject_name: routine.subject_name,
          classroom_name: routine.classroom_name,
          teacher_name: routine.teacher_name,
          camera_name: routine.camera_name,
          camera_url: routine.camera_url,
          start_time: `${new Date().toISOString().split('T')[0]}T${routine.start_time}`,
          end_time: `${new Date().toISOString().split('T')[0]}T${routine.end_time}`,
          year: routine.year,
          stream: routine.stream,
          status: routine.is_cancelled ? 'cancelled' : (isPast ? 'ended' : 'scheduled'),
          is_custom: false
        };
      });

    // ── STEP 4: Merge and Audit ──
    const allSessions = [...dbSessions, ...upcomingRoutine];

    // Final Guard Auditor
    const finalSessions = [];
    for (const s of allSessions) {
      let updatedS = { ...s };
      if (s.status === 'active') {
        const sessionEnd = new Date(s.end_time);
        const isPast = typeof s.end_time === 'string' 
          ? s.end_time < currentTimeStr 
          : now > sessionEnd;
          
        if (isPast) {
          if (!String(s.id).startsWith('routine_')) {
            await finalizeSession(s.id, io);
          }
          updatedS.status = 'ended';
        }
      }
      finalSessions.push(updatedS);
    }
    const filteredSessions = finalSessions.filter(s =>
      s.status !== 'ended' ||
      allCustom === 'true' ||
      week_start ||
      new Date(s.start_time).toDateString() === new Date().toDateString()
    );

    // Priority Sorting: Active first, then by start_time
    filteredSessions.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      
      const aTime = String(a.start_time);
      const bTime = String(b.start_time);
      return aTime.localeCompare(bTime);
    });

    res.json(filteredSessions);
  } catch (err) {
    console.error('[getSessions Maintenance Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// Admin-only: Force delete any custom session regardless of week
export const deleteCustomSession = async (req, res) => {
  const { id } = req.params;
  try {
    const sessionId = parseInt(id);
    const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1 AND is_custom = true', [sessionId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Custom session not found' });
    }

    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);

    const io = req.app.get('io');
    if (io) io.emit('session_ended', { id: sessionId });

    console.log(`[AdminDelete] Custom session ${sessionId} force-deleted by admin.`);
    res.json({ message: 'Custom session permanently deleted', id: sessionId });
  } catch (err) {
    console.error('[deleteCustomSession Error]:', err.message);
    res.status(500).json({ message: err.message });
  }
};
