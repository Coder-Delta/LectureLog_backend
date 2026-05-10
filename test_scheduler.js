import pool from './src/config/database.config.js';

async function testScheduler() {
  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const currentDay = istDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const istDateStr = istDate.toISOString().split('T')[0];
    const currentTimeStr = istDate.toISOString().split('T')[1].substring(0, 8);

    console.log(`Testing Scheduler at ${currentDay} ${currentTimeStr} IST`);

    const query = `
      SELECT s.*, sub.name as subject_name 
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1 
        AND s.start_time <= $2::time 
        AND s.end_time > $2::time
        AND NOT EXISTS (
          SELECT 1 FROM timetable_week_entries t
          WHERE t.source_id = s.id 
            AND t.source_type = 'regular'
            AND t.entry_date = $3::date
            AND t.action IN ('cancelled', 'deleted')
        )
    `;
    const { rows: schedules } = await pool.query(query, [currentDay, currentTimeStr, istDateStr]);
    
    console.log(`Found ${schedules.length} schedules to start.`);
    
    for (const schedule of schedules) {
        console.log(`Checking duplicates for ${schedule.subject_name} (${schedule.start_time})`);
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
        `, [schedule.id, schedule.subject_id, schedule.classroom_id, schedule.year, schedule.stream, istDateStr, schedule.start_time]);

        console.log(`Duplicates found: ${existing.length}`);
        if (existing.length > 0) {
            console.log(existing);
        } else {
            console.log("No duplicates! Should start.");
        }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testScheduler();
