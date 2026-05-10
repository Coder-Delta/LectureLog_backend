import cron from 'node-cron';
import pool from '../config/database.config.js';
import axios from 'axios';
import { finalizeSession } from '../controllers/session.controller.js';

export const initScheduler = (app) => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    // Force IST for background scheduler
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5) + ':00'; // HH:MM:00 (IST)

    try {
      // Find timetable entries for this time
      const { rows: schedules } = await pool.query(`
        SELECT t.*, sub.name as subject_name 
        FROM timetable_week_entries t
        JOIN subjects sub ON t.subject_id = sub.id
        WHERE t.day_of_week = $1 
          AND t.start_time <= $2::time 
          AND t.end_time >= $2::time
          AND t.action = 'active'
          AND t.week_start <= CURRENT_DATE 
          AND (t.week_start + interval '6 days') >= CURRENT_DATE
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

            // Notify AI service to start scanning
            axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(e => {});
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
          
          // Notify AI service
          axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(e => {});
        });
      }

      // 3a. Physically delete CUSTOM sessions that have expired (their purpose is done)
      const { rows: expiredCustom } = await pool.query(`
        SELECT id FROM sessions 
        WHERE is_custom = true
          AND end_time <= $1
      `, [now]);

      if (expiredCustom.length > 0) {
        const io = app.get('io');
        console.log(`[Scheduler] Finalizing ${expiredCustom.length} expired custom session(s).`);
        for (const s of expiredCustom) {
          await finalizeSession(s.id, io);
        }
      }

      // 3b. End/delete NON-CUSTOM sessions that have reached their end_time or are zombie (started on previous day)
      const { rows: endingSessions } = await pool.query(`
        SELECT id FROM sessions 
        WHERE is_custom = false
          AND status IN ('active', 'scheduled') 
          AND (
            end_time <= $1 -- Past its end time
            OR start_time::date < CURRENT_DATE -- Started on a previous day (Stale/Zombie session)
          )
      `, [now]);

      if (endingSessions.length > 0) {
        const io = app.get('io');
        console.log(`[Scheduler] Finalizing ${endingSessions.length} expired non-custom sessions.`);
        for (const s of endingSessions) {
          await finalizeSession(s.id, io);
        }
      }

    } catch (err) {
      console.error('[Scheduler Error]:', err);
    }
  });

  console.log('Automated Scheduler Service Initialized.');
};
