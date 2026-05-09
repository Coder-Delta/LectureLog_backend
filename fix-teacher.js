import pool from './src/config/database.config.js';

async function fixTeacher() {
  try {
    await pool.query("UPDATE users SET organization_id = 8 WHERE email = 'kumar@gmail.com'");
    console.log("Fixed kumar@gmail.com organization_id to 8");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixTeacher();
