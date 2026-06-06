import pool from '../config/database.config.js';

/**
 * Get all classrooms
 */
export const getClassrooms = async (req, res) => {
  const { organization_id } = req.user;
  try {
    const result = await pool.query(
      `SELECT c.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', cam.id,
                    'camera_url', cam.camera_url,
                    'camera_name', cam.camera_name,
                    'camera_type', cam.camera_type,
                    'camera_quality', cam.camera_quality
                  )
                ) FILTER (WHERE cam.id IS NOT NULL),
                '[]'::json
              ) as cameras
       FROM classrooms c
       LEFT JOIN cameras cam ON c.id = cam.classroom_id
       WHERE c.organization_id = $1
       GROUP BY c.id
       ORDER BY c.id ASC`,
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
  const { name } = req.body;
  const { organization_id } = req.user;

  let camerasList = req.body.cameras;
  if (!camerasList && req.body.camera_url) {
    camerasList = [{
      camera_url: req.body.camera_url,
      camera_name: req.body.camera_name || 'Primary Camera',
      camera_type: req.body.camera_type || 'webcam',
      camera_quality: req.body.camera_quality || '720p'
    }];
  }

  if (!name || !camerasList || camerasList.length === 0) {
    return res.status(400).json({ message: 'Classroom name and at least one camera are required' });
  }

  const urls = camerasList.map(c => c.camera_url);
  if (new Set(urls).size !== urls.length) {
    return res.status(400).json({ message: 'Duplicate camera URLs are not allowed in the same classroom' });
  }

  try {
    // Validate camera uniqueness within the organization
    const { rows: existing } = await pool.query(
      `SELECT c.camera_url, cl.name as classroom_name 
       FROM cameras c 
       JOIN classrooms cl ON c.classroom_id = cl.id 
       WHERE c.camera_url = ANY($1) AND cl.organization_id = $2`,
      [urls, organization_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        message: `Camera input '${existing[0].camera_url}' is already assigned to classroom '${existing[0].classroom_name}'.` 
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const primaryCam = camerasList[0] || { camera_url: '0', camera_name: 'Primary Camera' };

      // Insert classroom
      const classRes = await client.query(
        'INSERT INTO classrooms (name, camera_url, camera_name, camera_type, camera_quality, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [name, primaryCam.camera_url, primaryCam.camera_name, primaryCam.camera_type || 'webcam', primaryCam.camera_quality || '720p', organization_id]
      );
      const newClassroom = classRes.rows[0];

      // Insert cameras
      const insertedCams = [];
      for (const cam of camerasList) {
        const camRes = await client.query(
          'INSERT INTO cameras (classroom_id, camera_url, camera_name, camera_type, camera_quality, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [newClassroom.id, cam.camera_url, cam.camera_name, cam.camera_type || 'webcam', cam.camera_quality || '720p', organization_id]
        );
        insertedCams.push(camRes.rows[0]);
      }

      await client.query('COMMIT');
      newClassroom.cameras = insertedCams;
      res.status(201).json(newClassroom);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
  const { name } = req.body;
  const { organization_id } = req.user;

  let camerasList = req.body.cameras;
  if (!camerasList && req.body.camera_url) {
    camerasList = [{
      camera_url: req.body.camera_url,
      camera_name: req.body.camera_name || 'Primary Camera',
      camera_type: req.body.camera_type || 'webcam',
      camera_quality: req.body.camera_quality || '720p'
    }];
  }

  if (!name || !camerasList || camerasList.length === 0) {
    return res.status(400).json({ message: 'Classroom name and at least one camera are required' });
  }

  const urls = camerasList.map(c => c.camera_url);
  if (new Set(urls).size !== urls.length) {
    return res.status(400).json({ message: 'Duplicate camera URLs are not allowed in the same classroom' });
  }

  try {
    // Validate camera uniqueness within the organization (exclude self)
    const { rows: existing } = await pool.query(
      `SELECT c.camera_url, cl.name as classroom_name 
       FROM cameras c 
       JOIN classrooms cl ON c.classroom_id = cl.id 
       WHERE c.camera_url = ANY($1) AND c.classroom_id != $2 AND cl.organization_id = $3`,
      [urls, id, organization_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        message: `Camera input '${existing[0].camera_url}' is already assigned to classroom '${existing[0].classroom_name}'.` 
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const primaryCam = camerasList[0] || { camera_url: '0', camera_name: 'Primary Camera' };

      // Update classroom
      const result = await client.query(
        'UPDATE classrooms SET name = $1, camera_url = $2, camera_name = $3, camera_type = $4, camera_quality = $5 WHERE id = $6 AND organization_id = $7 RETURNING *',
        [name, primaryCam.camera_url, primaryCam.camera_name, primaryCam.camera_type || 'webcam', primaryCam.camera_quality || '720p', id, organization_id]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Classroom not found in your institution' });
      }

      // Delete existing cameras
      await client.query('DELETE FROM cameras WHERE classroom_id = $1', [id]);

      // Insert new cameras
      const insertedCams = [];
      for (const cam of camerasList) {
        const camRes = await client.query(
          'INSERT INTO cameras (classroom_id, camera_url, camera_name, camera_type, camera_quality, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [id, cam.camera_url, cam.camera_name, cam.camera_type || 'webcam', cam.camera_quality || '720p', organization_id]
        );
        insertedCams.push(camRes.rows[0]);
      }

      await client.query('COMMIT');
      const updatedClassroom = result.rows[0];
      updatedClassroom.cameras = insertedCams;
      res.json(updatedClassroom);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
