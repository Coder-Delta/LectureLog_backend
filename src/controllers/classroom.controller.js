import pool from '../config/database.config.js';

/**
 * Get all classrooms
 */
export const getClassrooms = async (req, res) => {
  const { organization_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT * FROM classrooms WHERE organization_id = $1 ORDER BY id ASC',
      [organization_id]
    );
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
  const { name, camera_url, camera_name, camera_type, camera_quality } = req.body;
  const { organization_id } = req.user;

  if (!name || !camera_url) {
    return res.status(400).json({ message: 'Classroom name and camera IDs are required' });
  }

  try {
    // Validate camera uniqueness within the organization
    const { rows: existing } = await pool.query(
      "SELECT id, name FROM classrooms WHERE camera_url = $1 AND organization_id = $2",
      [camera_url, organization_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: `Camera input '${camera_url}' is already assigned to classroom '${existing[0].name}'.` });
    }

    const result = await pool.query(
      'INSERT INTO classrooms (name, camera_url, camera_name, camera_type, camera_quality, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, camera_url, camera_name, camera_type || 'webcam', camera_quality || '720p', organization_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding classroom:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Classroom name already exists in your institution' });
    }
    res.status(500).json({ message: 'Error adding classroom', error: err.message });
  }
};

/**
 * Update a classroom
 */
export const updateClassroom = async (req, res) => {
  const { id } = req.params;
  const { name, camera_url, camera_name, camera_type, camera_quality } = req.body;
  const { organization_id } = req.user;

  if (!name || !camera_url) {
    return res.status(400).json({ message: 'Classroom name and camera IDs are required' });
  }

  try {
    // Validate camera uniqueness within the organization (exclude self)
    const { rows: existing } = await pool.query(
      "SELECT id, name FROM classrooms WHERE camera_url = $1 AND id != $2 AND organization_id = $3",
      [camera_url, id, organization_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: `Camera input '${camera_url}' is already assigned to classroom '${existing[0].name}'.` });
    }

    const result = await pool.query(
      'UPDATE classrooms SET name = $1, camera_url = $2, camera_name = $3, camera_type = $4, camera_quality = $5 WHERE id = $6 AND organization_id = $7 RETURNING *',
      [name, camera_url, camera_name, camera_type || 'webcam', camera_quality || '720p', id, organization_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Classroom not found in your institution' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating classroom:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Classroom name already exists in your institution' });
    }
    res.status(500).json({ message: 'Error updating classroom', error: err.message });
  }
};

/**
 * Delete a classroom
 */
export const deleteClassroom = async (req, res) => {
  const { id } = req.params;
  const { organization_id } = req.user;

  try {
    const result = await pool.query(
      'DELETE FROM classrooms WHERE id = $1 AND organization_id = $2 RETURNING *', 
      [id, organization_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Classroom not found in your institution' });
    }

    res.json({ message: 'Classroom deleted successfully', classroom: result.rows[0] });
  } catch (err) {
    console.error('Error deleting classroom:', err);
    res.status(500).json({ message: 'Error deleting classroom', error: err.message });
  }
};
