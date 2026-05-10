import pool from './src/config/database.config.js';

async function checkStatus() {
  try {
    const now = new Date();
    // IST Adjustment (5.5 hours)
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    
    // Get day and time in IST
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[istTime.getUTCDay()]; 
    const hours = String(istTime.getUTCHours()).padStart(2, '0');
    const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    console.log(`--- CURRENT STATE ---`);
    console.log(`Server Time (UTC): ${now.toISOString()}`);
    console.log(`IST Time: ${istTime.toISOString()}`);
    console.log(`Detected IST Day: ${day}`);
    console.log(`Detected IST Time: ${timeStr}`);

    console.log(`\n--- ACTIVE SESSIONS ---`);
    const activeRes = await pool.query("SELECT * FROM sessions WHERE status = 'active'");
    console.table(activeRes.rows);

    console.log(`\n--- RECENT SESSIONS ---`);
    const recentRes = await pool.query("SELECT * FROM sessions ORDER BY id DESC LIMIT 5");
    console.table(recentRes.rows);

    console.log(`\n--- TODAY'S SCHEDULE (${day}) ---`);
    const schedRes = await pool.query(`
      SELECT s.id, s.start_time, s.end_time, sub.name as subject_name, s.year, s.stream
      FROM schedules s 
      JOIN subjects sub ON s.subject_id = sub.id 
      WHERE s.day_of_week = $1 
      ORDER BY s.start_time
    `, [day]);
    console.table(schedRes.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkStatus();
