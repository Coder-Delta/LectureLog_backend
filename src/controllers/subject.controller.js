import pool from '../config/database.config.js';

/**
 * Get all subjects
 */
export const getSubjects = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ message: 'Error fetching subjects', error: err.message });
  }
};

/**
 * Add a new subject
 */
export const addSubject = async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: 'Subject name and code are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *',
      [name, code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding subject:', err);
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Subject name or code already exists' });
    }
    res.status(500).json({ message: 'Error adding subject', error: err.message });
  }
};

/**
 * Update a subject
 */
export const updateSubject = async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;

  if (!name || !code) {
    return res.status(400).json({ message: 'Subject name and code are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE subjects SET name = $1, code = $2 WHERE id = $3 RETURNING *',
      [name, code, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating subject:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Subject name or code already exists' });
    }
    res.status(500).json({ message: 'Error updating subject', error: err.message });
  }
};

/**
 * Delete a subject
 */
export const deleteSubject = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM subjects WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json({ message: 'Subject deleted successfully', subject: result.rows[0] });
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(500).json({ message: 'Error deleting subject', error: err.message });
  }
};
