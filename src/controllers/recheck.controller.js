import pool from '../config/database.config.js';

export const createRecheckRequest = async (req, res) => {
  const { student_id, session_id, message } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO recheck_requests (student_id, session_id, message, status) VALUES (?, ?, ?, ?)',
      [student_id, session_id, message, 'pending']
    );
    
    // Agent Layer: Auto-approve logic could go here
    // For now, just mark as pending
    
    res.status(201).json({ message: 'Recheck request submitted', requestId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getRecheckRequests = async (req, res) => {
  try {
    const [requests] = await pool.query(`
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
    await pool.query('UPDATE recheck_requests SET status = ? WHERE id = ?', [status, id]);

    if (status === 'approved') {
      // Find the request details
      const [request] = await pool.query('SELECT student_id, session_id FROM recheck_requests WHERE id = ?', [id]);
      if (request.length > 0) {
        const { student_id, session_id } = request[0];
        // Mark as present in attendance table
        await pool.query(
          'INSERT INTO attendance (student_id, session_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
          [student_id, session_id, 'present', 'present']
        );
      }
    }

    res.json({ message: `Request ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
