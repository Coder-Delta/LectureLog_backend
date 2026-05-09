import pool from './src/config/database.config.js';

async function checkTeacher() {
  try {
    const res = await pool.query("SELECT u.id, u.name, u.email, u.organization_id, o.name as org_name, u.role FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.email = 'kumar@gmail.com'");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkTeacher();
