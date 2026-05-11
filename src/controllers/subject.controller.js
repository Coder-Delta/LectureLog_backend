import pool from '../config/database.config.js';

/**
 * Get all subjects
 */
export const getSubjects = async (req, res) => {
  const { organization_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT * FROM subjects WHERE organization_id = $1 OR organization_id IS NULL ORDER BY id ASC',
      [organization_id]
    );
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
  const { organization_id } = req.user;

  if (!name || !code) {
    return res.status(400).json({ message: 'Subject name and code are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO subjects (name, code, organization_id) VALUES ($1, $2, $3) RETURNING *',
      [name, code, organization_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding subject:', err);
    if (err.code === '23505') { 
      return res.status(409).json({ message: 'Subject name or code already exists in your institution' });
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
  const { organization_id } = req.user;

  if (!name || !code) {
    return res.status(400).json({ message: 'Subject name and code are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE subjects SET name = $1, code = $2 WHERE id = $3 AND (organization_id = $4 OR organization_id IS NULL) RETURNING *',
      [name, code, id, organization_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Subject not found in your institution' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating subject:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Subject name or code already exists in your institution' });
    }
    res.status(500).json({ message: 'Error updating subject', error: err.message });
  }
};

/**
 * Delete a subject
 */
export const deleteSubject = async (req, res) => {
  const { id } = req.params;
  const { organization_id } = req.user;

  try {
    const result = await pool.query(
      'DELETE FROM subjects WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL) RETURNING *', 
      [id, organization_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Subject not found in your institution' });
    }

    res.json({ message: 'Subject deleted successfully', subject: result.rows[0] });
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(500).json({ message: 'Error deleting subject', error: err.message });
  }
};
