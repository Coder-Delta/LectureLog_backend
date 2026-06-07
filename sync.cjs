const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ user: 'postgres', password: '@anish321@', host: 'localhost', port: 5432, database: 'Merge' });
async function sync() {
  const { rows } = await pool.query("SELECT id, schedule_id, classroom_id FROM sessions WHERE status = 'active' AND is_custom = false");
  for (const s of rows) {
    const { rows: sc } = await pool.query('SELECT classroom_id FROM schedule_classrooms WHERE schedule_id = $1', [s.schedule_id]);
    if (sc.length > 0) {
      for (const r of sc) {
        await pool.query('INSERT INTO session_classrooms (session_id, classroom_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, r.classroom_id]);
      }
    } else if (s.classroom_id) {
      await pool.query('INSERT INTO session_classrooms (session_id, classroom_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, s.classroom_id]);
    }
  }
  console.log('Synced', rows.length, 'sessions');
  pool.end();
}
sync();
