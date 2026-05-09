import pool from '../src/config/database.config.js';
import { finalizeSession } from '../src/controllers/session.controller.js';

const test = async () => {
  try {
    // Manually finalize session 84
    await finalizeSession(84);
    
    const { rows } = await pool.query('SELECT * FROM attendance WHERE session_id = 84');
    console.log('Attendance Records for Session 84:');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
test();
