
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'Merge',
  port: 5432
});

async function check() {
  try {
    const res = await pool.query("SELECT id, subject_id, status, end_time, is_custom FROM sessions WHERE status = 'active'");
    console.log("Active Sessions Count:", res.rows.length);
    console.log("Active Sessions:", JSON.stringify(res.rows, null, 2));
    
    const now = new Date();
    console.log("Current UTC Time (now):", now.toISOString());
    
    res.rows.forEach(s => {
        const endTime = new Date(s.end_time);
        console.log(`Session ${s.id} End Time (parsed):`, endTime.toISOString());
        console.log(`Is Past? ${endTime <= now}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
