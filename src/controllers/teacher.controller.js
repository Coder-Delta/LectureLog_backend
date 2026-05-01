import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

/**
 * Register a new teacher
 */
export const registerTeacher = async (req, res) => {
  const { name, email, college_id } = req.body;
  const imageFile = req.file;

  if (!imageFile) {
    return res.status(400).json({ message: 'Teacher photo is required' });
  }

  if (!name || !email || !college_id) {
    return res.status(400).json({ message: 'Name, email, and college ID are required' });
  }

  try {
    // Generate a default password using the college_id
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(college_id, salt);

    // Save to PostgreSQL
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, college_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, email, hashedPassword, 'teacher', college_id]
    );
    const teacherId = result.rows[0].id;

    // Save photo permanently
    const teacherImgDir = path.join('public', 'teachers');
    if (!fs.existsSync(teacherImgDir)) {
      fs.mkdirSync(teacherImgDir, { recursive: true });
    }
    const finalPath = path.join(teacherImgDir, `${teacherId}.jpg`);
    fs.copyFileSync(imageFile.path, finalPath);

    // Clean up temp file
    if (fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    res.status(201).json({ message: 'Teacher registered successfully', teacherId });
  } catch (err) {
    console.error('Registration Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Error registering teacher', error: err.message });
  }
};

/**
 * Get all teachers
 */
export const getTeachers = async (req, res) => {
  try {
    const { rows: teachers } = await pool.query(
      "SELECT id, name, email, college_id, created_at FROM users WHERE role = 'teacher' ORDER BY created_at DESC"
    );
    res.json(teachers);
  } catch (err) {
    console.error('Error fetching teachers:', err);
    res.status(500).json({ message: 'Error fetching teachers', error: err.message });
  }
};

/**
 * Delete a teacher
 */
export const deleteTeacher = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Delete photo if exists
    const photoPath = path.join('public', 'teachers', `${id}.jpg`);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    // 2. Delete from database
    const result = await pool.query("DELETE FROM users WHERE id = $1 AND role = 'teacher'", [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({ message: 'Teacher deleted successfully' });
  } catch (err) {
    console.error('Error deleting teacher:', err);
    res.status(500).json({ message: 'Error deleting teacher', error: err.message });
  }
};

/**
 * Retrieves the profile details for the currently logged-in teacher.
 */
export const getMyProfile = async (req, res) => {
  const teacherId = req.user.id;
  try {
    const { rows: teachers } = await pool.query(
      'SELECT id, name, email, college_id, role FROM users WHERE id = $1',
      [teacherId]
    );
    if (teachers.length === 0) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }
    res.json(teachers[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
