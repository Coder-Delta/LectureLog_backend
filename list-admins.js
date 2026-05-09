import pool from './src/config/database.config.js';

async function listAdmins() {
  try {
    const res = await pool.query("SELECT id, name, email, organization_id, role FROM users WHERE role = 'admin'");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listAdmins();
