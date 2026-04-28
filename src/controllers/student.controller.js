import pool from '../config/database.config.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Registers a new student in the system.
 * 1. Takes the student's details and photo.
 * 2. Sends the photo to the AI service to generate a face embedding (JSON vector).
 * 3. Saves the student data and the AI embedding into PostgreSQL.
 * 4. Saves the physical photo to the local file system.
 */
export const registerStudent = async (req, res) => {
  const { name, email, roll_number, college_id, year } = req.body;
  const imageFile = req.file;

  if (!imageFile) {
    return res.status(400).json({ message: 'Student photo is required for registration' });
  }

  try {
    // 1. Get embedding from AI Service first to ensure photo is valid
    const aiFormData = new FormData();
    aiFormData.append('file', fs.createReadStream(imageFile.path));

    const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'}/embed`, aiFormData, {
      headers: aiFormData.getHeaders(),
    });

    const embedding = aiResponse.data.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('AI Service failed to generate a valid face embedding.');
    }

    // 2. Save to PostgreSQL (Including the face vector as JSONB)
    const result = await pool.query(
      'INSERT INTO students (name, email, roll_number, college_id, year, face_embedding) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [name, email, roll_number, college_id, year, JSON.stringify(embedding)]
    );
    const studentId = result.rows[0].id;

    // 3. Save photo permanently
    const studentImgDir = path.join('public', 'students');
    if (!fs.existsSync(studentImgDir)) {
      fs.mkdirSync(studentImgDir, { recursive: true });
    }
    const finalPath = path.join(studentImgDir, `${studentId}.jpg`);
    fs.copyFileSync(imageFile.path, finalPath);

    // Clean up temp file
    if (fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    res.status(201).json({ message: 'Student registered successfully', studentId });
  } catch (err) {
    console.error('Registration Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    res.status(500).json({ message: err.response?.data?.error || err.message });
  }
};

/**
 * Retrieves all registered students from the database.
 * Used primarily for the admin dashboard.
 */
export const getStudents = async (req, res) => {
  try {
    const { rows: students } = await pool.query('SELECT id, name, email, roll_number, college_id, year, face_embedding, created_at FROM students ORDER BY created_at DESC');
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Retrieves the attendance history for the currently logged-in student.
 * Joins the attendance, sessions, and subjects tables to provide a detailed view.
 */
export const getMyAttendance = async (req, res) => {
  const studentId = req.user.id;
  try {
    const { rows: attendance } = await pool.query(`
      SELECT a.*, s.start_time, sub.name as subject_name
      FROM attendance a
      JOIN sessions s ON a.session_id = s.id
      JOIN subjects sub ON s.subject_id = sub.id
      WHERE a.student_id = $1
      ORDER BY s.start_time DESC
    `, [studentId]);
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Calculates basic statistics for the logged-in student.
 * Returns the total number of sessions they were part of, and how many they attended.
 */
export const getMyStats = async (req, res) => {
  const studentId = req.user.id;
  try {
    const { rows: presentCount } = await pool.query(
      "SELECT COUNT(*)::int as count FROM attendance WHERE student_id = $1 AND status = 'present'",
      [studentId]
    );
    const { rows: totalCount } = await pool.query(
      'SELECT COUNT(*)::int as count FROM attendance WHERE student_id = $1',
      [studentId]
    );
    res.json({
      present: presentCount[0].count,
      total: totalCount[0].count
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Deletes a student from the system.
 * Removes both the database record and the physical image file from the server.
 */
export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Delete photo if exists
    const photoPath = path.join('public', 'students', `${id}.jpg`);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    // 2. Delete from database
    const result = await pool.query('DELETE FROM students WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
