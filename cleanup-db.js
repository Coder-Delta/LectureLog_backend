import pool from './src/config/database.config.js';

const cleanupDb = async () => {
  let client;

  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL database for cleanup.');
    await client.query('BEGIN');

    // Delete global fallback classrooms
    const { rowCount: classroomsDeleted } = await client.query(
      'DELETE FROM classrooms WHERE organization_id IS NULL'
    );
    console.log(`✅ Deleted ${classroomsDeleted} global default classroom(s).`);

    // Delete global fallback subjects
    const { rowCount: subjectsDeleted } = await client.query(
      'DELETE FROM subjects WHERE organization_id IS NULL'
    );
    console.log(`✅ Deleted ${subjectsDeleted} global default subject(s).`);

    await client.query('COMMIT');
    console.log('Database cleanup completed successfully.');
    
    client.release();
    process.exit(0);
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error during database cleanup:', err);
    client?.release();
    process.exit(1);
  }
};

cleanupDb();
