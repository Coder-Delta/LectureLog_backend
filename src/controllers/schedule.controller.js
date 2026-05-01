import pool from '../config/database.config.js';

export const createSchedule = async (req, res) => {
  const { subject_id, classroom_id, day_of_week, start_time, end_time, teacher_id, year, camera_id, stream } = req.body;
  const creator_id = req.user.id;
  const final_teacher_id = teacher_id || creator_id;

  try {
    console.log('[createSchedule] Checking collisions for:', { day_of_week, start_time, classroom_id, final_teacher_id });
    // 1. Check for collisions in Regular Schedules (classroom, teacher, OR same year+stream)
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1 AND s.start_time::time = $2::time
      AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
    `, [day_of_week, start_time, classroom_id, final_teacher_id, year || '1', stream || 'CSE']);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group (Year/Stream)';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      else if (collision.teacher_id === parseInt(final_teacher_id)) reason = 'Teacher';
      
      return res.status(400).json({ 
        message: `Conflict Detected! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) during this time slot.` 
      });
    }

    // 2. Check for collisions in Custom Sessions (Active/Scheduled)
    const { rows: sessionCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE (s.classroom_id = $1 OR s.teacher_id = $2 OR (s.year = $3 AND s.stream = $4))
      AND s.status IN ('active', 'scheduled')
      AND TRIM(TO_CHAR(s.start_time, 'Day')) = $5
      AND s.start_time::time <= $6::time AND s.end_time::time > $6::time
    `, [classroom_id, final_teacher_id, year || '1', stream || 'CSE', day_of_week, start_time]);

    if (sessionCollisions.length > 0) {
      const collision = sessionCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      if (collision.teacher_id === parseInt(final_teacher_id)) reason = 'Teacher';

      return res.status(400).json({ 
        message: `Collision! ${reason} is already occupied by a Custom Session (${collision.subject_name} - Year ${collision.year || 'N/A'} ${collision.stream || 'N/A'}) during this time.` 
      });
    }

    const result = await pool.query(
      'INSERT INTO schedules (subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time, year, camera_id, stream) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [subject_id, classroom_id, final_teacher_id, day_of_week, start_time, end_time, year || '1', camera_id || '0', stream || 'CSE']
    );
    res.status(201).json({ message: 'Schedule created', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSchedules = async (req, res) => {
  const { year, stream } = req.query;
  try {
    let query = `
      SELECT s.*, sub.name as subject_name, u.name as teacher_name, c.name as classroom_name,
             CASE WHEN cc.id IS NOT NULL THEN true ELSE false END as is_cancelled
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN users u ON s.teacher_id = u.id
      JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN cancelled_classes cc ON s.id = cc.schedule_id AND cc.cancel_date = CURRENT_DATE
    `;
    const params = [];
    const conditions = [];
    
    if (year) {
      params.push(year);
      conditions.push(`s.year = $${params.length}`);
    }
    
    if (stream) {
      params.push(stream);
      conditions.push(`s.stream = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
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
      SELECT s.*, sub.name as subject_name, c.name as classroom_name, c.camera_url,
             CASE WHEN cc.id IS NOT NULL THEN true ELSE false END as is_cancelled
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN cancelled_classes cc ON s.id = cc.schedule_id AND cc.cancel_date = CURRENT_DATE
      WHERE s.teacher_id = $1
    `, [teacher_id]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { subject_id, classroom_id, teacher_id, camera_id } = req.body;
  try {
    console.log('[updateSchedule] Checking collisions for ID:', id, { classroom_id, teacher_id });
    // 1. Get original schedule info to get day and time
    const { rows: original } = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (original.length === 0) return res.status(404).json({ message: 'Schedule not found' });
    
    const { day_of_week, start_time } = original[0];

    // 2. Check for collisions in Regular Schedules (excluding current)
    const { rows: routineCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.day_of_week = $1 AND s.start_time = $2
      AND (s.classroom_id = $3 OR s.teacher_id = $4 OR (s.year = $5 AND s.stream = $6))
      AND s.id != $7
    `, [day_of_week, start_time, classroom_id, teacher_id, original[0].year, original[0].stream, id]);

    if (routineCollisions.length > 0) {
      const collision = routineCollisions[0];
      let reason = 'Student Group (Year/Stream)';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      else if (collision.teacher_id === parseInt(teacher_id)) reason = 'Teacher';

      return res.status(400).json({ 
        message: `Conflict Detected! ${reason} is already occupied by the Year ${collision.year} ${collision.stream} class (${collision.subject_name}) during this time slot.` 
      });
    }

    // 3. Check for collisions in Custom Sessions (Active/Scheduled)
    const { rows: sessionCollisions } = await pool.query(`
      SELECT s.*, sub.name as subject_name FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE (s.classroom_id = $1 OR s.teacher_id = $2)
      AND s.status IN ('active', 'scheduled')
      AND TRIM(TO_CHAR(s.start_time, 'Day')) = $3
      AND s.start_time::time <= $4::time AND s.end_time::time > $4::time
    `, [classroom_id, teacher_id, day_of_week, start_time]);

    if (sessionCollisions.length > 0) {
      const collision = sessionCollisions[0];
      let reason = 'Student Group';
      if (collision.classroom_id === parseInt(classroom_id)) reason = 'Classroom';
      if (collision.teacher_id === parseInt(teacher_id)) reason = 'Teacher';

      return res.status(400).json({ 
        message: `Collision! ${reason} is already occupied by a Custom Session (${collision.subject_name} - Year ${collision.year || 'N/A'} ${collision.stream || 'N/A'}) during this time.` 
      });
    }

    await pool.query(
      'UPDATE schedules SET subject_id = $1, classroom_id = $2, teacher_id = $3, camera_id = $4 WHERE id = $5',
      [subject_id, classroom_id, teacher_id, camera_id, id]
    );
    res.json({ message: 'Schedule updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteSchedule = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const cancelSchedule = async (req, res) => {
  const { id } = req.params;
  const { college_id } = req.body;
  const teacher_id = req.user.id;

  try {
    const { rows: schedules } = await pool.query('SELECT * FROM schedules WHERE id = $1 AND teacher_id = $2', [id, teacher_id]);
    if (schedules.length === 0) {
      return res.status(404).json({ message: 'Schedule not found or unauthorized' });
    }

    const { rows: users } = await pool.query('SELECT college_id FROM users WHERE id = $1', [teacher_id]);
    if (users.length === 0 || users[0].college_id !== college_id) {
      return res.status(403).json({ message: 'Invalid College ID' });
    }

    await pool.query('INSERT INTO cancelled_classes (schedule_id, cancel_date) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING', [id]);
    res.json({ message: 'Class cancelled successfully for today' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
