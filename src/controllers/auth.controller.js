import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const signup = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    if (role === 'teacher') {
      const { rows: preRegistered } = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND role = 'teacher'",
        [email]
      );
      
      if (preRegistered.length === 0) {
        return res.status(403).json({ 
          message: 'Public teacher signup is disabled. Only pre-registered teachers can sign up. Please contact your administrator.' 
        });
      }

      // Pre-registered teacher found, update their password and activation
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET name = $1, password = $2 WHERE email = $3',
        [name, hashedPassword, email]
      );
      
      return res.status(200).json({
        message: 'Teacher account activated successfully!'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hashedPassword, role || 'teacher']
    );
    res.status(201).json({
      message: role === 'admin' ? 'Admin created' : 'User created',
      userId: result.rows[0].id
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const login = async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const { rows: users } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = users[0];

    // STRICT ROLE CHECK: Only allow login if the role matches (e.g. Teacher login must have role 'teacher')
    if (role && user.role !== role) {
      return res.status(401).json({ 
        message: `Unauthorized: This account is not registered as a ${role.charAt(0).toUpperCase() + role.slice(1)}.` 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows: admins } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND role = $2',
      [email, 'admin']
    );
    if (admins.length === 0) {
      return res.status(401).json({ message: 'Invalid Admin credentials' });
    }

    const admin = admins[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid Admin credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const studentLogin = async (req, res) => {
  const { roll_number, college_id } = req.body;
  try {
    const { rows: students } = await pool.query(
      'SELECT * FROM students WHERE roll_number = $1 AND college_id = $2', 
      [roll_number, college_id]
    );

    if (students.length === 0) {
      return res.status(401).json({ message: 'Invalid Roll Number or College ID' });
    }

    const student = students[0];
    const token = jwt.sign(
      { id: student.id, roll_number: student.roll_number, role: 'student' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    res.json({ 
      token, 
      user: { 
        id: student.id, 
        name: student.name, 
        roll_number: student.roll_number, 
        year: student.year,
        stream: student.stream,
        role: 'student' 
      } 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
