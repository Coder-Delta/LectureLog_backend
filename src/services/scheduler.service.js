import cron from 'node-cron';
import pool from '../config/database.config.js';
import axios from 'axios';
import { finalizeSession } from '../controllers/session.controller.js';

export const initScheduler = (app) => {
  console.log('[Scheduler] Initializing background maintenance service...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    
    // Get current time in India (IST) reliably for routine matching
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    
    // Reliable local date string (YYYY-MM-DD)
    const istDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA gives YYYY-MM-DD
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    const currentTimeStr = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kolkata' }); // HH:MM:SS
    
    console.log(`[Scheduler] 🕒 Tick: ${currentDay} ${currentTimeStr} IST (UTC: ${now.toISOString()})`);

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDateStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const yesterdayDay = yesterday.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });

    try {
      // --- STEP A: Auto-Start Routine Sessions ---
      const { rows: schedules } = await pool.query(`
        SELECT s.*, sub.name as subject_name, 
               (CASE WHEN s.day_of_week = $1 THEN $3::date ELSE $5::date END) as session_date
        FROM schedules s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE (
          -- Case 1: Started today
          (s.day_of_week = $1 AND (
            (s.start_time <= $2::time AND s.end_time > $2::time AND s.end_time > s.start_time)
            OR
            (s.start_time <= $2::time AND s.end_time < s.start_time)
          ))
          OR
          -- Case 2: Started yesterday but ends today (crossover)
          (s.day_of_week = $4 AND s.end_time < s.start_time AND s.end_time > $2::time)
        )
        AND NOT EXISTS (
          SELECT 1 FROM timetable_week_entries t
          WHERE t.source_id = s.id 
            AND t.source_type = 'regular'
            AND t.entry_date = (CASE WHEN s.day_of_week = $1 THEN $3::date ELSE $5::date END)
            AND t.action IN ('cancelled', 'deleted')
        )
      `, [currentDay, currentTimeStr, istDateStr, yesterdayDay, yesterdayDateStr]);

      for (const schedule of schedules) {
        const sDateStr = new Date(schedule.session_date).toLocaleDateString('en-CA');
        // Check for duplicates
        const { rows: existing } = await pool.query(`
          SELECT id, status FROM sessions 
          WHERE (
            schedule_id = $1 
            OR (
              subject_id = $2 AND classroom_id = $3 AND year::text = $4::text AND stream = $5
              AND start_time::time = $7::time
            )
          )
          AND start_time::date = $6::date
          AND status != 'cancelled'
        `, [schedule.id, schedule.subject_id, schedule.classroom_id, schedule.year, schedule.stream, sDateStr, schedule.start_time]);

        if (existing.length === 0) {
          console.log(`[Scheduler] 🚀 Auto-starting routine session: ${schedule.subject_name}`);
          const startStr = `${sDateStr}T${schedule.start_time}+05:30`;
          
          // Handle midnight rollover for end date
          let endDayStr = sDateStr;
          if (schedule.end_time < schedule.start_time) {
            const startDateObj = new Date(`${sDateStr}T00:00:00`);
            const nextDay = new Date(startDateObj.getTime() + 24 * 60 * 60 * 1000);
            endDayStr = nextDay.toISOString().split('T')[0];
          }
          const endStr = `${endDayStr}T${schedule.end_time}+05:30`;

          const result = await pool.query(
            'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, schedule_id, is_custom, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
            [schedule.subject_id, schedule.classroom_id, schedule.teacher_id, startStr, endStr, 'active', schedule.year, schedule.stream, schedule.id, false, schedule.organization_id]
          );

          const io = app.get('io');
          if (io) io.emit('session_started', { id: result.rows[0].id, status: 'active' });
          axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(() => {});
        }
      }

      // --- STEP B: Activate 'Scheduled' sessions whose time has come ---
      const { rows: toActivate } = await pool.query(`
        UPDATE sessions SET status = 'active'
        WHERE status = 'scheduled' 
          AND start_time <= $1 
          AND end_time > $1
        RETURNING id, subject_id
      `, [now]);

      if (toActivate.length > 0) {
        const io = app.get('io');
        for (const s of toActivate) {
          console.log(`[Scheduler] ⚡ Activating scheduled session ${s.id}`);
          if (io) io.emit('session_started', { id: s.id, status: 'active' });
        }
        axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(() => {});
      }

      // --- STEP C: Finalize Expired Sessions ---
      const { rows: toFinalize } = await pool.query(`
        SELECT id, subject_id FROM sessions 
        WHERE status IN ('active', 'scheduled') 
          AND (
            end_time <= $1 
            OR start_time::date < ($2::date - interval '20 hours') -- Safety cleanup for very old sessions
          )
      `, [now, now]);

      if (toFinalize.length > 0) {
        const io = app.get('io');
        console.log(`[Scheduler] 🏁 Finalizing ${toFinalize.length} expired session(s).`);
        for (const s of toFinalize) {
          await finalizeSession(s.id, io);
        }
      }

    } catch (err) {
      console.error('[Scheduler Error]:', err.message);
    }
  });

  console.log('[Scheduler] Automated Scheduler Service Initialized.');
};
