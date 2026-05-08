import pool from '../src/config/database.config.js';

async function checkData() {
  try {
    const { rows: columns } = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'students'"
    );
    console.log('Students Columns:', columns);

    const { rows: students } = await pool.query('SELECT id, name, roll_number, year, stream FROM students');
    console.log('Students:', students);

    if (students.length > 0) {
      const s = students[0];
      const { rows: todaySchedules } = await pool.query(
        'SELECT * FROM schedules WHERE year = $1 AND stream = $2 AND day_of_week = $3',
        [s.year.toString(), s.stream, today]
      );
      console.log(`Schedules for ${s.name} (Year ${s.year}, ${s.stream}) on ${today}:`, todaySchedules);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
