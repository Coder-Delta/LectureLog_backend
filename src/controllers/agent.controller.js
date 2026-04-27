import pool from '../config/database.config.js';

export const getAttendanceReports = async (req, res) => {
  try {
    // Basic aggregation: stats by subject
    const { rows: stats } = await pool.query(`
      SELECT sub.name as subject, COUNT(a.id) as total_present
      FROM attendance a
      JOIN sessions s ON a.session_id = s.id
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE a.status = 'present'
      GROUP BY sub.name
    `);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMonitoringData = async (req, res) => {
  try {
    // Detect students with low attendance (e.g., less than 75% of total sessions)
    const { rows: lowAttendance } = await pool.query(`
      SELECT s.name, s.email, 
             COUNT(a.id) as attended_sessions,
             COALESCE((SELECT COUNT(*) FROM sessions), 0) as total_sessions
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.status = 'present'
      GROUP BY s.id
      HAVING COALESCE((COUNT(a.id)::numeric / NULLIF((SELECT COUNT(*) FROM sessions), 0)), 0) < 0.75
          OR COUNT(a.id) = 0
    `);
    res.json(lowAttendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
