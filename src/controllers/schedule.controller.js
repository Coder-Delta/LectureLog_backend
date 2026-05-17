import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toDateOnly = (date) => date.toISOString().split('T')[0];

const getWeekStartDate = (value = null) => {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = base.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const getDateForDay = (weekStart, dayOfWeek) => {
  const idx = DAYS.indexOf(dayOfWeek);
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + (idx === 0 ? 6 : idx - 1));
  return date;
};

const isFutureWeek = (weekStart) => weekStart > getWeekStartDate();

export const createSchedule = async (req, res) => {
  const { subject_id, classroom_id, day_of_week, start_time, end_time, teacher_id, year, camera_id, stream } = req.body;
  const creator_id = req.user.id;
  const final_teacher_id = teacher_id || creator_id;

  try {
    console.log('[createSchedule] Checking collisions for:', { day_of_week, start_time, end_time, classroom_id, final_teacher_id });
    // 1. Check for collisions in Regular Schedules (classroom, teacher, OR same year+stream)
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1 AND s.start_time::time < $7::time AND s.end_time::time > $2::time
      AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
    `, [day_of_week, start_time, classroom_id, final_teacher_id, year || '1', stream || 'CSE', end_time]);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group (Year/Stream)';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      else if (collision.teacher_id === parseInt(final_teacher_id)) reason = 'Teacher';
      
      return res.status(400).json({ 
        message: `Conflict Detected! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) during this time slot.` 
      });
    }

    // 2. Check for collisions in Active or Scheduled Sessions
    const { rows: sessionCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE (s.classroom_id = $1 OR s.teacher_id = $2 OR (s.year = $3 AND s.stream = $4))
      AND s.status IN ('active', 'scheduled')
      AND TRIM(TO_CHAR(s.start_time, 'Day')) = $5
      AND s.start_time::time < $7::time AND s.end_time::time > $6::time
    `, [classroom_id, final_teacher_id, year || '1', stream || 'CSE', day_of_week, start_time, end_time]);

    if (sessionCollisions.length > 0) {
      const collision = sessionCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = `Classroom (${collision.classroom_id})`;
      if (collision.teacher_id === parseInt(final_teacher_id)) reason = `Teacher (${collision.teacher_id})`;

      return res.status(400).json({ 
        message: `Conflict! ${reason} is currently in an active or scheduled session (${collision.subject_name}). Please end or cancel that session before assigning a new routine.` 
      });
    }

    const org_id = req.user.organization_id;

    const result = await pool.query(
      'INSERT INTO schedules (subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time, year, camera_id, stream, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [subject_id, classroom_id, final_teacher_id, day_of_week, start_time, end_time, year || '1', camera_id || '0', stream || 'CSE', org_id]
    );
    res.status(201).json({ message: 'Schedule created successfully', id: result.rows[0].id });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSchedules = async (req, res) => {
  const { year, stream, week_start } = req.query;
  try {
    const targetWeekStart = getWeekStartDate(week_start);
    const targetWeekStartStr = toDateOnly(targetWeekStart);

    if (!isFutureWeek(targetWeekStart)) {
      await pool.query(`
        INSERT INTO timetable_week_entries (
          week_start, entry_date, source_type, source_id, action,
          subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time,
          year, stream, camera_id, camera_name, created_by
        )
        SELECT
          $1::date,
          $1::date + (
            CASE s.day_of_week
              WHEN 'Monday' THEN 0
              WHEN 'Tuesday' THEN 1
              WHEN 'Wednesday' THEN 2
              WHEN 'Thursday' THEN 3
              WHEN 'Friday' THEN 4
              WHEN 'Saturday' THEN 5
              ELSE 6
            END
          ),
          'regular',
          s.id,
          'active',
          s.subject_id,
          s.classroom_id,
          s.teacher_id,
          s.day_of_week,
          s.start_time,
          s.end_time,
          s.year,
          s.stream,
          s.camera_id,
          c.camera_name,
          $2
        FROM schedules s
        JOIN classrooms c ON s.classroom_id = c.id
        WHERE NOT EXISTS (
          SELECT 1 FROM timetable_week_entries twe
          WHERE twe.week_start = $1::date
            AND twe.source_type = 'regular'
            AND twe.source_id = s.id
            AND twe.action = 'active'
        )
      `, [targetWeekStartStr, req.user?.id || null]);
    }

    let query = `
      SELECT s.*, sub.name as subject_name, u.name as teacher_name, c.name as classroom_name, c.camera_name,
             CASE WHEN cc.id IS NOT NULL THEN true ELSE false END as is_cancelled,
             false as is_deleted_history,
             false as is_snapshot_history,
             'regular' as source_type
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN users u ON s.teacher_id = u.id
      JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN cancelled_classes cc ON s.id = cc.schedule_id
        AND cc.cancel_date >= $1::date
        AND cc.cancel_date < ($1::date + interval '7 days')
        AND TRIM(TO_CHAR(cc.cancel_date, 'Day')) = s.day_of_week
    `;
    const params = [targetWeekStartStr];
    const conditions = [];
    
    if (year) {
      params.push(year);
      conditions.push(`s.year = $${params.length}`);
    }
    
    if (stream) {
      params.push(stream);
      conditions.push(`s.stream = $${params.length}`);
    }

    // Exclude schedules that have been marked as 'deleted' for this specific week's snapshot
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM timetable_week_entries twe 
      WHERE twe.week_start = $1::date 
        AND twe.source_type = 'regular' 
        AND twe.source_id = s.id 
        AND twe.action = 'deleted'
    )`);

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    const { rows: schedules } = await pool.query(query, params);

    let historyQuery = `
      SELECT twe.id, twe.source_id, twe.subject_id, twe.classroom_id, twe.teacher_id,
             twe.day_of_week, twe.start_time, twe.end_time, twe.year, twe.stream, twe.camera_id, twe.camera_name,
             sub.name as subject_name, u.name as teacher_name, c.name as classroom_name,
             CASE WHEN twe.action = 'active' THEN false ELSE true END as is_cancelled,
             CASE WHEN twe.action = 'deleted' THEN true ELSE false END as is_deleted_history,
             true as is_snapshot_history,
             twe.source_type,
             twe.action as history_action
      FROM timetable_week_entries twe
      LEFT JOIN subjects sub ON twe.subject_id = sub.id
      LEFT JOIN users u ON twe.teacher_id = u.id
      LEFT JOIN classrooms c ON twe.classroom_id = c.id
      WHERE twe.week_start = $1::date
        AND (
          twe.action IN ('deleted', 'cancelled')
          OR twe.source_type = 'custom'
        )
    `;
    const historyParams = [targetWeekStartStr];
    if (year) {
      historyParams.push(year);
      historyQuery += ` AND twe.year = $${historyParams.length}`;
    }
    if (stream) {
      historyParams.push(stream);
      historyQuery += ` AND twe.stream = $${historyParams.length}`;
    }

    const { rows: historyRows } = await pool.query(historyQuery, historyParams);
    res.json([...schedules, ...historyRows]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMySchedules = async (req, res) => {
  const teacher_id = req.user.id;
  try {
    const { rows: schedules } = await pool.query(`
      SELECT s.*, sub.name as subject_name, c.name as classroom_name, c.camera_url,
             CASE WHEN cc.id IS NOT NULL THEN true ELSE false END as is_cancelled
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN cancelled_classes cc ON s.id = cc.schedule_id AND cc.cancel_date = CURRENT_DATE
      WHERE s.teacher_id = $1
    `, [teacher_id]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { subject_id, classroom_id, teacher_id, camera_id } = req.body;
  try {
    console.log('[updateSchedule] Checking collisions for ID:', id, { classroom_id, teacher_id });
    // 1. Get original schedule info to get day and time
    const { rows: original } = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (original.length === 0) return res.status(404).json({ message: 'Schedule not found' });
    
    const { day_of_week, start_time, end_time } = original[0];

    // 2. Check for collisions in Regular Schedules (excluding current)
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1 AND s.start_time::time < $8::time AND s.end_time::time > $2::time
      AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
      AND s.id != $7
    `, [day_of_week, start_time, classroom_id, teacher_id, original[0].year, original[0].stream, id, end_time]);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group (Year/Stream)';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      else if (collision.teacher_id === parseInt(teacher_id)) reason = 'Teacher';

      return res.status(400).json({ 
        message: `Conflict Detected! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) during this time slot.` 
      });
    }

    // 3. Check for collisions in Active or Scheduled Sessions
    const { rows: sessionCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE (s.classroom_id = $1 OR s.teacher_id = $2 OR (s.year = $3 AND s.stream = $4))
      AND s.status IN ('active', 'scheduled')
      AND TRIM(TO_CHAR(s.start_time, 'Day')) = $5
      AND s.start_time::time < $7::time AND s.end_time::time > $6::time
    `, [classroom_id, teacher_id, original[0].year, original[0].stream, day_of_week, start_time, end_time]);

    if (sessionCollisions.length > 0) {
      const collision = sessionCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = `Classroom (${collision.classroom_id})`;
      if (collision.teacher_id === parseInt(teacher_id)) reason = `Teacher (${collision.teacher_id})`;

      return res.status(400).json({ 
        message: `Conflict! ${reason} is currently in an active or scheduled session (${collision.subject_name}). Please end or cancel that session before assigning a new routine.` 
      });
    }

    await pool.query(
      'UPDATE schedules SET subject_id = $1, classroom_id = $2, teacher_id = $3, camera_id = $4 WHERE id = $5',
      [subject_id, classroom_id, teacher_id, camera_id, id]
    );
    res.json({ message: 'Schedule updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteSchedule = async (req, res) => {
  const { id } = req.params;
  const weekStartInput = req.query.week_start || req.body?.week_start;
  try {
    const { rows } = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Schedule not found' });

    const schedule = rows[0];
    const targetWeekStart = getWeekStartDate(weekStartInput);
    const targetWeekStartStr = toDateOnly(targetWeekStart);
    const userRole = req.user?.role?.toLowerCase();

    // ── Record in History Snapshot ──
    await pool.query(`
      INSERT INTO timetable_week_entries (
        week_start, entry_date, source_type, source_id, action,
        subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time,
        year, stream, camera_id, camera_name, created_by
      )
      VALUES ($1, $2, 'regular', $3, 'deleted', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      targetWeekStartStr,
      toDateOnly(getDateForDay(targetWeekStart, schedule.day_of_week)),
      schedule.id,
      schedule.subject_id,
      schedule.classroom_id,
      schedule.teacher_id,
      schedule.day_of_week,
      schedule.start_time,
      schedule.end_time,
      schedule.year,
      schedule.stream,
      schedule.camera_id,
      schedule.camera_name,
      req.user?.id || null,
    ]);

    if (userRole === 'admin') {
      // If it's today, stop any active session for this schedule
      const { rows: cancelledSessions } = await pool.query(`
        UPDATE sessions 
        SET status = 'cancelled'
        WHERE (schedule_id = $1 OR (subject_id = $2 AND classroom_id = $3 AND teacher_id = $4))
        AND start_time::date = CURRENT_DATE
        AND is_custom = false
        RETURNING id
      `, [id, schedule.subject_id, schedule.classroom_id, schedule.teacher_id]);

      await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

      const io = req.app.get('io');
      if (io && cancelledSessions.length > 0) {
        cancelledSessions.forEach(s => io.emit('session_ended', { id: s.id }));
      }

      res.json({ message: 'Routine updated: Class permanently removed and active session stopped.', role: 'admin' });
    } else {
      res.json({ message: 'Class removed from this week only.', role: 'teacher' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const cancelSchedule = async (req, res) => {
  const { id } = req.params;
  const { password, cancel_date, week_start } = req.body;
  const teacher_id = req.user.id;

  try {
    const { rows: schedules } = await pool.query('SELECT * FROM schedules WHERE id = $1 AND teacher_id = $2', [id, teacher_id]);
    if (schedules.length === 0) {
      return res.status(404).json({ message: 'Schedule not found or unauthorized' });
    }

    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1', [teacher_id]);
    if (users.length === 0) return res.status(404).json({ message: 'Teacher not found' });
    
    const isMatch = await bcrypt.compare(password, users[0].password);
    if (!isMatch) {
      return res.status(403).json({ message: 'Invalid password. Cancellation denied.' });
    }

    const finalCancelDate = cancel_date || toDateOnly(new Date());
    const finalWeekStart = week_start || toDateOnly(getWeekStartDate());

    await pool.query('INSERT INTO cancelled_classes (schedule_id, cancel_date) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, finalCancelDate]);

    // Snapshot entry for the specific week
    const schedule = schedules[0];
    await pool.query(`
      INSERT INTO timetable_week_entries (
        week_start, entry_date, source_type, source_id, action,
        subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time,
        year, stream, camera_id, camera_name, created_by
      )
      SELECT $1, $2, 'regular', $3, 'cancelled', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      WHERE NOT EXISTS (
        SELECT 1 FROM timetable_week_entries
        WHERE week_start = $1::date
          AND entry_date = $2::date
          AND source_type = 'regular'
          AND source_id = $3
          AND action = 'cancelled'
      )
    `, [
      finalWeekStart,
      finalCancelDate,
      schedule.id,
      schedule.subject_id,
      schedule.classroom_id,
      schedule.teacher_id,
      schedule.day_of_week,
      schedule.start_time,
      schedule.end_time,
      schedule.year,
      schedule.stream,
      schedule.camera_id,
      schedule.camera_name,
      teacher_id,
    ]);

    // If it's today, stop the active session by marking it cancelled
    if (finalCancelDate === toDateOnly(new Date())) {
      const { rows: activeSessions } = await pool.query(`
        UPDATE sessions 
        SET status = 'cancelled'
        WHERE (schedule_id = $1 OR (subject_id = $2 AND classroom_id = $3 AND teacher_id = $4))
        AND start_time::date = CURRENT_DATE
        AND is_custom = false
        RETURNING *
      `, [id, schedule.subject_id, schedule.classroom_id, schedule.teacher_id]);

      if (activeSessions.length > 0) {
        for (const sess of activeSessions) {
          if (sess.year && sess.stream) {
            const { rows: roster } = await pool.query(
              "SELECT id FROM students WHERE year::text = $1::text AND LOWER(stream) = LOWER($2) AND status = 'active'",
              [sess.year, sess.stream]
            );
            if (roster.length > 0) {
              const valueStrings = roster.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
              const flatValues = roster.flatMap(s => [s.id, sess.id, 'absent']);
              await pool.query(`
                INSERT INTO attendance (student_id, session_id, status)
                VALUES ${valueStrings}
                ON CONFLICT (student_id, session_id) DO NOTHING
              `, flatValues);
            }
          }
        }
      }

      const io = req.app.get('io');
      if (io && activeSessions.length > 0) {
        activeSessions.forEach(s => io.emit('session_ended', { id: s.id }));
      }
    }

    res.json({ message: 'Class cancelled successfully for ' + finalCancelDate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
