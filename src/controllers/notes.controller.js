import pool from '../config/database.config.js';

export const uploadNote = async (req, res) => {
  const { schedule_id, session_id, file_name, upload_date } = req.body;
  const teacher_id = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file_url = req.file.path;

    const { rows } = await pool.query(
      `INSERT INTO class_notes (schedule_id, session_id, teacher_id, file_url, file_name, upload_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [schedule_id || null, session_id || null, teacher_id, file_url, file_name || req.file.originalname, upload_date]
    );

    res.status(201).json({ message: 'Note uploaded successfully', note: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getNotes = async (req, res) => {
  const { schedule_id, session_id, date } = req.query;
  const orgId = req.user.organization_id;

  try {
    let query = `
      SELECT n.* 
      FROM class_notes n
      LEFT JOIN schedules sc ON n.schedule_id = sc.id
      LEFT JOIN sessions se ON n.session_id = se.id
      WHERE (sc.organization_id = $1 OR se.organization_id = $1)
    `;
    const params = [orgId];

    if (schedule_id) {
      params.push(schedule_id);
      query += ` AND n.schedule_id = $${params.length}`;
    }
    if (session_id) {
      params.push(session_id);
      query += ` AND n.session_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      query += ` AND n.upload_date = $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
