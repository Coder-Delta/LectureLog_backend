import pool from './src/config/database.config.js';

async function listClassrooms() {
  try {
    const res = await pool.query("SELECT c.id, c.name, c.camera_url, c.organization_id, o.name as org_name FROM classrooms c LEFT JOIN organizations o ON c.organization_id = o.id");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listClassrooms();
