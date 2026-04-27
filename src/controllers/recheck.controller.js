import pool from '../config/database.config.js';

export const createRecheckRequest = async (req, res) => {
  const { student_id, session_id, message } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO recheck_requests (student_id, session_id, message, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [student_id, session_id, message, 'pending']
    );
    
    // Agent Layer: Auto-approve logic could go here
    // For now, just mark as pending
    
    res.status(201).json({ message: 'Recheck request submitted', requestId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getRecheckRequests = async (req, res) => {
  try {
    const { rows: requests } = await pool.query(`
      SELECT r.*, s.name as student_name, sub.name as subject_name
      FROM recheck_requests r
      JOIN students s ON r.student_id = s.id
      JOIN sessions sess ON r.session_id = sess.id
      JOIN subjects sub ON sess.subject_id = sub.id
      ORDER BY r.id DESC
    `);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateRecheckStatus = async (req, res) => {
  const { id, status } = req.body; // status: 'approved' or 'rejected'
  try {
    await pool.query('UPDATE recheck_requests SET status = $1 WHERE id = $2', [status, id]);

    if (status === 'approved') {
      // Find the request details
      const { rows: request } = await pool.query('SELECT student_id, session_id FROM recheck_requests WHERE id = $1', [id]);
      if (request.length > 0) {
        const { student_id, session_id } = request[0];
        // Mark as present in attendance table
        await pool.query(
          `INSERT INTO attendance (student_id, session_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, session_id) DO UPDATE SET status = EXCLUDED.status`,
          [student_id, session_id, 'present']
        );
      }
    }

    res.json({ message: `Request ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
