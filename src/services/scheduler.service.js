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
      const [schedules] = await pool.query(`
        SELECT * FROM schedules 
        WHERE day_of_week = ? AND start_time = ?
      `, [currentDay, currentTime]);

      for (const schedule of schedules) {
        // Check if session already exists for today/subject
        const [existing] = await pool.query(`
          SELECT * FROM sessions 
          WHERE subject_id = ? AND classroom_id = ? AND DATE(start_time) = CURDATE()
        `, [schedule.subject_id, schedule.classroom_id]);

        if (existing.length === 0) {
          console.log(`[Scheduler] Starting automated session for Subject ${schedule.subject_id}`);
          
          const startDate = new Date();
          const [h, m, s] = schedule.end_time.split(':');
          const endDate = new Date();
          endDate.setHours(h, m, s);

          const [result] = await pool.query(
            'INSERT INTO sessions (subject_id, classroom_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)',
            [schedule.subject_id, schedule.classroom_id, startDate, endDate, 'active']
          );

          // Notify frontend
          const io = app.get('io');
          if (io) {
            io.emit('session_started', {
              id: result.insertId,
              subject_id: schedule.subject_id,
              classroom_id: schedule.classroom_id
            });
          }
        }
      }

      // Check for sessions that should end
      await pool.query(`
        UPDATE sessions SET status = 'ended' 
        WHERE status = 'active' AND end_time <= ?
      `, [now]);

    } catch (err) {
      console.error('[Scheduler Error]:', err.message);
    }
  });

  console.log('Automated Scheduler Service Initialized.');
};
