import pool from '../config/database.config.js';

/**
 * Get all classrooms
 */
export const getClassrooms = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM classrooms ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classrooms:', err);
    res.status(500).json({ message: 'Error fetching classrooms', error: err.message });
  }
};

/**
 * Add a new classroom
 */
export const addClassroom = async (req, res) => {
  const { name, camera_url } = req.body;
  if (!name || !camera_url) {
    return res.status(400).json({ message: 'Classroom name and camera IDs are required' });
  }

  try {
    // Validate camera uniqueness: each camera can only be assigned to one classroom
    const { rows: existing } = await pool.query(
      "SELECT id, name FROM classrooms WHERE camera_url = $1",
      [camera_url]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: `Camera input '${camera_url}' is already assigned to classroom '${existing[0].name}'. Each camera can only belong to one classroom.` });
    }

    const result = await pool.query(
      'INSERT INTO classrooms (name, camera_url) VALUES ($1, $2) RETURNING *',
      [name, camera_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding classroom:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Classroom name already exists' });
    }
    res.status(500).json({ message: 'Error adding classroom', error: err.message });
  }
};

/**
 * Update a classroom
 */
export const updateClassroom = async (req, res) => {
  const { id } = req.params;
  const { name, camera_url } = req.body;

  if (!name || !camera_url) {
    return res.status(400).json({ message: 'Classroom name and camera IDs are required' });
  }

  try {
    // Validate camera uniqueness: each camera can only be assigned to one classroom (exclude self)
    const { rows: existing } = await pool.query(
      "SELECT id, name FROM classrooms WHERE camera_url = $1 AND id != $2",
      [camera_url, id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: `Camera input '${camera_url}' is already assigned to classroom '${existing[0].name}'. Each camera can only belong to one classroom.` });
    }

    const result = await pool.query(
      'UPDATE classrooms SET name = $1, camera_url = $2 WHERE id = $3 RETURNING *',
      [name, camera_url, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating classroom:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Classroom name already exists' });
    }
    res.status(500).json({ message: 'Error updating classroom', error: err.message });
  }
};

/**
 * Delete a classroom
 */
export const deleteClassroom = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM classrooms WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    res.json({ message: 'Classroom deleted successfully', classroom: result.rows[0] });
  } catch (err) {
    console.error('Error deleting classroom:', err);
    res.status(500).json({ message: 'Error deleting classroom', error: err.message });
  }
};
