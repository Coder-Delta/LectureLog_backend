import pool from '../config/database.config.js';

export const createSchedule = async (req, res) => {
  const { subject_id, classroom_id, day_of_week, start_time, end_time, teacher_id, year, camera_id } = req.body;
  const creator_id = req.user.id;
  const final_teacher_id = teacher_id || creator_id;

  try {
    const result = await pool.query(
      'INSERT INTO schedules (subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time, year, camera_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [subject_id, classroom_id, final_teacher_id, day_of_week, start_time, end_time, year || '1', camera_id || '0']
    );
    res.status(201).json({ message: 'Schedule created', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSchedules = async (req, res) => {
  const { year } = req.query;
  try {
    let query = `
      SELECT s.*, sub.name as subject_name, u.name as teacher_name
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN users u ON s.teacher_id = u.id
    `;
    const params = [];
    
    if (year) {
      query += ` WHERE s.year = $${params.length + 1}`;
      params.push(year);
    }

    const { rows: schedules } = await pool.query(query, params);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMySchedules = async (req, res) => {
  const teacher_id = req.user.id;
  try {
    const { rows: schedules } = await pool.query(`
      SELECT s.*, sub.name as subject_name, c.name as classroom_name, c.camera_url
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      WHERE s.teacher_id = $1
    `, [teacher_id]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { day_of_week, start_time, end_time } = req.body;
  try {
    await pool.query(
      'UPDATE schedules SET day_of_week = $1, start_time = $2, end_time = $3 WHERE id = $4',
      [day_of_week, start_time, end_time, id]
    );
    res.json({ message: 'Schedule updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
