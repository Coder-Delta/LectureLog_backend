import cron from 'node-cron';
import pool from '../config/database.config.js';

export const initScheduler = (app) => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5) + ':00'; // HH:MM:00

    try {
      // Find schedules for this time - using explicit time cast
      const { rows: schedules } = await pool.query(`
        SELECT s.*, sub.name as subject_name 
        FROM schedules s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.day_of_week = $1 
          AND s.start_time <= $2::time 
          AND s.end_time >= $2::time
      `, [currentDay, currentTime]);

      if (schedules.length > 0) {
        console.log(`[Scheduler] Found ${schedules.length} scheduled classes for ${currentDay} ${currentTime}`);
      }

      // 1. Start automated sessions from routine
      for (const schedule of schedules) {
        // Check if session already exists for this specific schedule slot today
        const { rows: existing } = await pool.query(`
          SELECT * FROM sessions 
          WHERE (schedule_id = $1 OR (subject_id = $2 AND year = $3 AND stream = $4 AND status = 'active'))
            AND start_time::date = CURRENT_DATE
            AND status != 'cancelled'
        `, [schedule.id, schedule.subject_id, schedule.year, schedule.stream]);

        if (existing.length === 0) {
          console.log(`[Scheduler] Starting automated session: ${schedule.subject_name} (${schedule.start_time} - ${schedule.end_time})`);

          const startDate = new Date(); // Start at current actual time

          // Determine end date from schedule time
          const [h, m, s_part] = String(schedule.end_time).split(':');
          const endDate = new Date();
          endDate.setHours(parseInt(h), parseInt(m), parseInt(s_part) || 0);

          const result = await pool.query(
            'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, schedule_id, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            [schedule.subject_id, schedule.classroom_id, schedule.teacher_id, startDate, endDate, 'active', schedule.year || '1', schedule.stream || 'CSE', schedule.id, false]
          );

          const sessionId = result.rows[0].id;
          console.log(`[Scheduler] Session created successfully with ID: ${sessionId}`);

          // Notify frontend with full details
          const io = app.get('io');
          if (io) {
            io.emit('session_started', {
              id: sessionId,
              subject_id: schedule.subject_id,
              subject_name: schedule.subject_name,
              classroom_id: schedule.classroom_id,
              classroom_name: schedule.classroom_name,
              teacher_id: schedule.teacher_id,
              teacher_name: schedule.teacher_name,
              year: schedule.year,
              stream: schedule.stream,
              status: 'active',
              start_time: startDate,
              end_time: endDate
            });
          }
        }
      }

      // 2. Activate manually 'scheduled' sessions whose time has arrived
      const { rows: toActivate } = await pool.query(`
        UPDATE sessions SET status = 'active'
        WHERE status = 'scheduled' AND start_time <= $1 AND end_time > $1
        RETURNING id, subject_id
      `, [now]);

      if (toActivate.length > 0) {
        const io = app.get('io');
        toActivate.forEach(s => {
          console.log(`[Scheduler] Activating manually scheduled session ${s.id}`);
          if (io) io.emit('session_started', { id: s.id, subject_id: s.subject_id });
        });
      }

      // 3. End sessions that have reached their end_time (Date-Aware Physical Deletion)
      const { rows: endingSessions } = await pool.query(`
        SELECT id FROM sessions 
        WHERE status IN ('active', 'scheduled') 
          AND (
            end_time <= $1 -- Past its end time today
            OR start_time::date < CURRENT_DATE -- Started on a previous day (Stale/Zombie session)
          )
      `, [now]);

      if (endingSessions.length > 0) {
        const io = app.get('io');
        const sessionIds = endingSessions.map(s => s.id);

        console.log(`[Scheduler] Cleaning up ${sessionIds.length} expired sessions.`);

        // 1. Notify frontend first
        if (io) {
          sessionIds.forEach(id => {
            io.emit('session_ended', { id });
          });
        }

        // 2. Physical Wipe from Database
        await pool.query('DELETE FROM sessions WHERE id = ANY($1)', [sessionIds]);
      }

    } catch (err) {
      console.error('[Scheduler Error]:', err);
    }
  });

  console.log('Automated Scheduler Service Initialized.');
};
