import pool from '../config/database.config.js';

export const createSchedule = async (req, res) => {
  const { subject_id, classroom_id, day_of_week, start_time, end_time, teacher_id, year, camera_id } = req.body;
  const creator_id = req.user.id;
  const final_teacher_id = teacher_id || creator_id;

  try {
    // Migration: Ensure columns exist
    await pool.query('ALTER TABLE schedules ADD COLUMN IF NOT EXISTS year ENUM("1", "2", "3", "4") DEFAULT "1"');
    await pool.query('ALTER TABLE schedules ADD COLUMN IF NOT EXISTS camera_id VARCHAR(50) DEFAULT "0"');

    const [result] = await pool.query(
      'INSERT INTO schedules (subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time, year, camera_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [subject_id, classroom_id, final_teacher_id, day_of_week, start_time, end_time, year || '1', camera_id || '0']
    );
    res.status(201).json({ message: 'Schedule created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSchedules = async (req, res) => {
  const { year } = req.query;
  try {
    let query = `
      SELECT s.*, sub.name as subject_name, t.name as teacher_name
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN teachers t ON s.teacher_id = t.id
    `;
    const params = [];
    
    if (year) {
      query += ' WHERE s.year = ?';
      params.push(year);
    }

    const [schedules] = await pool.query(query, params);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMySchedules = async (req, res) => {
  const teacher_id = req.user.id;
  try {
    const [schedules] = await pool.query(`
      SELECT s.*, sub.name as subject_name, c.name as classroom_name
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      WHERE s.teacher_id = ?
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
      'UPDATE schedules SET day_of_week = ?, start_time = ?, end_time = ? WHERE id = ?',
      [day_of_week, start_time, end_time, id]
    );
    res.json({ message: 'Schedule updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
