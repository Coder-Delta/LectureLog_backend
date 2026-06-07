import pool from '../config/database.config.js';

// Phase 6: Advanced Filters Parser
const parseSearchQuery = (q) => {
  const query = q || '';
  const filters = {};
  const keywords = [];
  
  const tokens = query.split(' ');
  for (const token of tokens) {
    if (token.includes(':')) {
      const [key, value] = token.split(':');
      if (key && value) {
        filters[key.toLowerCase()] = value.toLowerCase();
      }
    } else if (token.trim() !== '') {
      keywords.push(token);
    }
  }
  
  return {
    searchTerm: keywords.join(' '),
    filters
  };
};

export const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    const organization_id = req.user?.organization_id;
    const role = req.user?.role;
    const userId = req.user?.id;
    
    if (!organization_id) return res.status(400).json({ message: 'Organization context missing' });
    if (!q || q.length < 2) {
      return res.json({ students: [], teachers: [], subjects: [], classrooms: [], sessions: [] });
    }

    const { searchTerm, filters } = parseSearchQuery(q);
    const likeTerm = `%${searchTerm}%`;

    // Advanced filters extraction
    let yearFilter = filters.year ? `AND year = ${parseInt(filters.year)}` : '';
    let streamFilter = filters.stream ? `AND stream ILIKE '%${filters.stream}%'` : '';

    // Phase 9: Role-Based Permissions
    let teacherSessionFilter = role === 'teacher' ? `AND s.teacher_id = ${userId}` : '';
    // Let students see sessions for their year/stream if needed, but for now we'll allow basic search
    
    // Students
    let studentQuery = `
      SELECT id, name, roll, year, stream, email FROM students 
      WHERE organization_id = $1 
      AND (name ILIKE $2 OR roll ILIKE $2)
      ${yearFilter} ${streamFilter}
      ORDER BY 
        CASE WHEN name ILIKE $3 THEN 1 ELSE 2 END, name
      LIMIT 10
    `;
    const { rows: students } = await pool.query(studentQuery, [organization_id, likeTerm, `${searchTerm}%`]);

    // Teachers
    let teacherQuery = `
      SELECT id, name, email FROM users 
      WHERE organization_id = $1 AND role = 'teacher'
      AND name ILIKE $2
      ORDER BY 
        CASE WHEN name ILIKE $3 THEN 1 ELSE 2 END, name
      LIMIT 10
    `;
    const { rows: teachers } = await pool.query(teacherQuery, [organization_id, likeTerm, `${searchTerm}%`]);

    // Subjects
    let subjectQuery = `
      SELECT id, name, code, year, stream FROM subjects 
      WHERE organization_id = $1 
      AND (name ILIKE $2 OR code ILIKE $2)
      ${yearFilter} ${streamFilter}
      ORDER BY 
        CASE WHEN name ILIKE $3 THEN 1 ELSE 2 END, name
      LIMIT 10
    `;
    const { rows: subjects } = await pool.query(subjectQuery, [organization_id, likeTerm, `${searchTerm}%`]);

    // Classrooms
    let classroomQuery = `
      SELECT id, name, camera_name FROM classrooms 
      WHERE organization_id = $1 
      AND name ILIKE $2
      ORDER BY 
        CASE WHEN name ILIKE $3 THEN 1 ELSE 2 END, name
      LIMIT 10
    `;
    const { rows: classrooms } = await pool.query(classroomQuery, [organization_id, likeTerm, `${searchTerm}%`]);

    // Sessions
    let sessionQuery = `
      SELECT s.id, s.status, s.year, s.stream, s.start_time, sub.name as subject_name, u.name as teacher_name
      FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE sub.organization_id = $1
      AND (sub.name ILIKE $2 OR u.name ILIKE $2 OR s.status ILIKE $2)
      ${teacherSessionFilter}
      ORDER BY s.start_time DESC
      LIMIT 10
    `;
    const { rows: sessions } = await pool.query(sessionQuery, [organization_id, likeTerm]);

    res.json({
      students,
      teachers,
      subjects,
      classrooms,
      sessions
    });

  } catch (error) {
    console.error('[Search] Global Search Error:', error);
    res.status(500).json({ message: 'Error performing global search' });
  }
};

export const attendanceSearch = async (req, res) => {
  try {
    const { q } = req.query;
    const organization_id = req.user?.organization_id;
    
    if (!q || q.length < 2) return res.json([]);

    const { searchTerm } = parseSearchQuery(q);
    const likeTerm = `%${searchTerm}%`;

    // Simple attendance search based on student name or roll
    const { rows: attendance } = await pool.query(`
      SELECT a.id, a.status, a.timestamp, s.name as student_name, s.roll, sess.start_time, sub.name as subject_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN sessions sess ON a.session_id = sess.id
      JOIN subjects sub ON sess.subject_id = sub.id
      WHERE s.organization_id = $1
      AND (s.name ILIKE $2 OR s.roll ILIKE $2 OR a.status ILIKE $2)
      ORDER BY a.timestamp DESC
      LIMIT 20
    `, [organization_id, likeTerm]);

    res.json(attendance);
  } catch (error) {
    console.error('[Search] Attendance Search Error:', error);
    res.status(500).json({ message: 'Error performing attendance search' });
  }
};

export const sessionSearch = async (req, res) => {
  try {
    const { q } = req.query;
    const organization_id = req.user?.organization_id;
    const role = req.user?.role;
    const userId = req.user?.id;
    
    if (!q || q.length < 2) return res.json([]);

    const { searchTerm, filters } = parseSearchQuery(q);
    const likeTerm = `%${searchTerm}%`;

    let teacherSessionFilter = role === 'teacher' ? `AND s.teacher_id = ${userId}` : '';
    let statusFilter = filters.status ? `AND s.status ILIKE '%${filters.status}%'` : '';

    const { rows: sessions } = await pool.query(`
      SELECT s.id, s.status, s.year, s.stream, s.start_time, s.end_time, sub.name as subject_name, u.name as teacher_name
      FROM sessions s
      JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE sub.organization_id = $1
      AND (sub.name ILIKE $2 OR u.name ILIKE $2 OR s.status ILIKE $2)
      ${teacherSessionFilter}
      ${statusFilter}
      ORDER BY s.start_time DESC
      LIMIT 20
    `, [organization_id, likeTerm]);

    res.json(sessions);
  } catch (error) {
    console.error('[Search] Session Search Error:', error);
    res.status(500).json({ message: 'Error performing session search' });
  }
};
