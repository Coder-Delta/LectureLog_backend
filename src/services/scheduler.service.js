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
    const currentDay = istDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const istDateStr = istDate.toISOString().split('T')[0];
    const currentTimeStr = istDate.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
    
    console.log(`[Scheduler] 🕒 Tick: ${currentDay} ${currentTimeStr} IST (UTC: ${now.toISOString()})`);

    try {
      // --- STEP A: Auto-Start Routine Sessions ---
      const { rows: schedules } = await pool.query(`
        SELECT t.*, sub.name as subject_name 
        FROM timetable_week_entries t
        JOIN subjects sub ON t.subject_id = sub.id
        WHERE t.day_of_week = $1 
          AND t.start_time <= $2::time 
          AND t.end_time > $2::time
          AND t.action = 'active'
          AND t.week_start <= $3::date 
          AND (t.week_start + interval '6 days') >= $3::date
      `, [currentDay, currentTimeStr, istDateStr]);

      for (const schedule of schedules) {
        // Check for duplicates
        const { rows: existing } = await pool.query(`
          SELECT id, status FROM sessions 
          WHERE (schedule_id = $1 OR (subject_id = $2 AND classroom_id = $3 AND year::text = $4::text AND stream = $5))
            AND start_time::date = $6::date
            AND status != 'cancelled'
        `, [schedule.id, schedule.subject_id, schedule.classroom_id, schedule.year, schedule.stream, istDateStr]);

        if (existing.length === 0) {
          console.log(`[Scheduler] 🚀 Auto-starting routine session: ${schedule.subject_name}`);
          const startStr = `${istDateStr}T${schedule.start_time}+05:30`;
          const endStr = `${istDateStr}T${schedule.end_time}+05:30`;

          const result = await pool.query(
            'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status, year, stream, schedule_id, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            [schedule.subject_id, schedule.classroom_id, schedule.teacher_id, startStr, endStr, 'active', schedule.year, schedule.stream, schedule.id, false]
          );

          const io = app.get('io');
          if (io) io.emit('session_started', { id: result.rows[0].id, status: 'active' });
          axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/system/refresh`).catch(() => {});
        }
      }

      // --- STEP B: Activate 'Scheduled' sessions whose time has come ---
      // We use the JS 'now' to ensure we match the system clock the user sees
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
            OR start_time::date < ($2::date - interval '5 hours') -- Handle rollover
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
