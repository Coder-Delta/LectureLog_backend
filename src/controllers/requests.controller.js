import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';

export const getRequests = async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { role, id } = req.user;
    
    let query = `
      SELECT r.*, 
             s.subject_id, sub.name as subject_name, 
             u.name as requester_name,
             t.name as target_teacher_name,
             c.name as classroom_name,
             sess.start_time, sess.end_time, sess.year, sess.stream
      FROM class_requests r
      LEFT JOIN schedules s ON r.schedule_id = s.id
      LEFT JOIN sessions sess ON r.session_id = sess.id
      LEFT JOIN subjects sub ON s.subject_id = sub.id OR sess.subject_id = sub.id
      LEFT JOIN users u ON r.requester_id = u.id
      LEFT JOIN users t ON r.target_teacher_id = t.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id OR sess.classroom_id = c.id
      WHERE r.organization_id = $1
    `;
    const params = [orgId];

    if (role === 'teacher') {
      // Teachers see requests they made OR requests targeted at them (handovers)
      query += ` AND (r.requester_id = $2 OR r.target_teacher_id = $2)`;
      params.push(id);
    }

    query += ` ORDER BY r.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createCancelRequest = async (req, res) => {
  const { schedule_id, session_id, reason, password, request_date } = req.body;
  const teacher_id = req.user.id;
  const orgId = req.user.organization_id;

  try {
    // 1. Verify Password
    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1', [teacher_id]);
    if (!users.length || !users[0].password) {
      return res.status(400).json({ message: 'Teacher password not set. Cannot verify.' });
    }
    const isMatch = await bcrypt.compare(password, users[0].password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

    // 2. Insert Request
    const { rows } = await pool.query(
      `INSERT INTO class_requests (schedule_id, session_id, requester_id, request_type, reason, request_date, organization_id)
       VALUES ($1, $2, $3, 'cancel', $4, $5, $6) RETURNING *`,
      [schedule_id || null, session_id || null, teacher_id, reason, request_date, orgId]
    );

    // 3. Notify Admins
    await pool.query(
      `INSERT INTO notifications (receiver_role, type, title, message, organization_id)
       VALUES ('admin', 'alert', 'Class Cancellation Request', 'A teacher has requested to cancel a class.', $1)`,
      [orgId]
    );

    res.status(201).json({ message: 'Cancellation request submitted', request: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createHandoverRequest = async (req, res) => {
  const { schedule_id, session_id, target_teacher_id, reason, password, request_date } = req.body;
  const teacher_id = req.user.id;
  const orgId = req.user.organization_id;

  try {
    // 1. Verify Password
    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1', [teacher_id]);
    if (!users.length || !users[0].password) {
      return res.status(400).json({ message: 'Teacher password not set. Cannot verify.' });
    }
    const isMatch = await bcrypt.compare(password, users[0].password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

    // 2. Insert Request
    const { rows } = await pool.query(
      `INSERT INTO class_requests (schedule_id, session_id, requester_id, target_teacher_id, request_type, reason, request_date, organization_id)
       VALUES ($1, $2, $3, $4, 'handover', $5, $6, $7) RETURNING *`,
      [schedule_id || null, session_id || null, teacher_id, target_teacher_id, reason, request_date, orgId]
    );

    // 3. Notify Target Teacher & Admins
    await pool.query(
      `INSERT INTO notifications (receiver_id, receiver_role, type, title, message, organization_id)
       VALUES ($1, 'teacher', 'info', 'Class Handover Request', 'You have been requested to take over a class.', $2)`,
      [target_teacher_id, orgId]
    );
    await pool.query(
      `INSERT INTO notifications (receiver_role, type, title, message, organization_id)
       VALUES ('admin', 'info', 'Class Handover Request', 'A class handover request has been initiated.', $1)`,
      [orgId]
    );

    res.status(201).json({ message: 'Handover request submitted', request: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const approveRequest = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'
  const userRole = req.user.role;
  const userId = req.user.id;

  try {
    const { rows: reqs } = await pool.query('SELECT * FROM class_requests WHERE id = $1', [id]);
    if (reqs.length === 0) return res.status(404).json({ message: 'Request not found' });
    const classReq = reqs[0];

    // Auth check
    if (userRole !== 'admin' && !(userRole === 'teacher' && classReq.target_teacher_id === userId && classReq.request_type === 'handover')) {
      return res.status(403).json({ message: 'Unauthorized to approve this request' });
    }

    // Update Request
    await pool.query('UPDATE class_requests SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

    // Perform actual logic if approved
    if (status === 'approved') {
      if (classReq.request_type === 'cancel') {
        if (classReq.schedule_id) {
          await pool.query(
            `INSERT INTO cancelled_classes (schedule_id, cancel_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [classReq.schedule_id, classReq.request_date]
          );
        } else if (classReq.session_id) {
          await pool.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [classReq.session_id]);
        }
      } else if (classReq.request_type === 'handover') {
        if (classReq.schedule_id) {
          // Add a custom session for the target teacher to override the schedule for that day
          const { rows: scheds } = await pool.query('SELECT * FROM schedules WHERE id = $1', [classReq.schedule_id]);
          if (scheds.length) {
             await pool.query(`
               INSERT INTO sessions (subject_id, teacher_id, classroom_id, status, year, stream, schedule_id, start_time, end_time, is_custom, organization_id)
               VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8, true, $9)
             `, [scheds[0].subject_id, classReq.target_teacher_id, scheds[0].classroom_id, scheds[0].year, scheds[0].stream, classReq.schedule_id, `${classReq.request_date}T${scheds[0].start_time}`, `${classReq.request_date}T${scheds[0].end_time}`, classReq.organization_id]);
          }
        } else if (classReq.session_id) {
          await pool.query(`UPDATE sessions SET teacher_id = $1 WHERE id = $2`, [classReq.target_teacher_id, classReq.session_id]);
        }
      }
    }

    // Notify Requester
    await pool.query(
      `INSERT INTO notifications (receiver_id, receiver_role, type, title, message, organization_id)
       VALUES ($1, 'teacher', 'info', 'Request ' || $2, 'Your class request has been ' || $2, $3)`,
      [classReq.requester_id, status, classReq.organization_id]
    );

    res.json({ message: \`Request \${status} successfully\` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
