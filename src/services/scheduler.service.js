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
      // Find schedules for this time
      const { rows: schedules } = await pool.query(`
        SELECT * FROM schedules 
        WHERE day_of_week = $1 AND start_time = $2
      `, [currentDay, currentTime]);

      for (const schedule of schedules) {
        // Check if session already exists for today/subject
        const { rows: existing } = await pool.query(`
          SELECT * FROM sessions 
          WHERE subject_id = $1 AND classroom_id = $2 AND start_time::date = CURRENT_DATE
        `, [schedule.subject_id, schedule.classroom_id]);

        if (existing.length === 0) {
          console.log(`[Scheduler] Starting automated session for Subject ${schedule.subject_id}`);
          
          const startDate = new Date();
          const [h, m, s] = String(schedule.end_time).split(':');
          const endDate = new Date();
          endDate.setHours(h, m, s);

          const result = await pool.query(
            'INSERT INTO sessions (subject_id, classroom_id, teacher_id, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [schedule.subject_id, schedule.classroom_id, schedule.teacher_id, startDate, endDate, 'active']
          );

          // Notify frontend
          const io = app.get('io');
          if (io) {
            io.emit('session_started', {
              id: result.rows[0].id,
              subject_id: schedule.subject_id,
              classroom_id: schedule.classroom_id
            });
          }
        }
      }

      // Check for sessions that should end
      await pool.query(`
        UPDATE sessions SET status = 'ended' 
        WHERE status = 'active' AND end_time <= $1
      `, [now]);

    } catch (err) {
      console.error('[Scheduler Error]:', err);
    }
  });

  console.log('Automated Scheduler Service Initialized.');
};
