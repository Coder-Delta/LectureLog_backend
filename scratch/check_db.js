import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '@anish321@',
  database: 'LectureLog',
  port: 5432
});

async function checkCancellations() {
  try {
    const res = await pool.query('SELECT * FROM cancelled_classes WHERE cancel_date = CURRENT_DATE');
    console.log('Cancellations today:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkCancellations();
