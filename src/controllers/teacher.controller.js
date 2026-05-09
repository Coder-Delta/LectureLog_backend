import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import cloudinary from '../config/cloudinary.config.js';

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

    // 2. Upload to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(imageFile.path, {
      folder: 'lecturelog/teachers',
    });

    // 3. Save to PostgreSQL
    const organization_id = req.user.organization_id;
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, college_id, face_embedding, image_url, cloudinary_id, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [
        name, 
        email, 
        hashedPassword, 
        'teacher', 
        college_id, 
        JSON.stringify(embedding),
        cloudinaryResponse.secure_url, 
        cloudinaryResponse.public_id,
        organization_id
      ]
    );
    const teacherId = result.rows[0].id;

    // Clean up temp file
    if (fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    res.status(201).json({ message: 'Teacher registered successfully', teacherId, image_url: cloudinaryResponse.secure_url });
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
      "SELECT id, name, email, college_id, image_url, created_at FROM users WHERE role = 'teacher' ORDER BY created_at DESC"
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
    // 1. Get Cloudinary ID
    const teacherResult = await pool.query("SELECT cloudinary_id FROM users WHERE id = $1 AND role = 'teacher'", [id]);
    if (teacherResult.rowCount > 0) {
      const { cloudinary_id } = teacherResult.rows[0];
      if (cloudinary_id) {
        await cloudinary.uploader.destroy(cloudinary_id);
      }
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
 * Update teacher details
 */
export const updateTeacher = async (req, res) => {
  const { id } = req.params;
  const { name, email, college_id } = req.body;
  const imageFile = req.file;

  try {
    let updateQuery = 'UPDATE users SET name = $1, email = $2, college_id = $3';
    let queryParams = [name, email, college_id];

    if (imageFile) {
      // 1. Get new embedding from AI Service
      const aiFormData = new FormData();
      aiFormData.append('file', fs.createReadStream(imageFile.path));

      const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'}/embed`, aiFormData, {
        headers: aiFormData.getHeaders(),
      });

      const embedding = aiResponse.data.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('AI Service failed to generate a valid face embedding.');
      }

      // 2. Upload new image to Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.upload(imageFile.path, {
        folder: 'lecturelog/teachers',
      });

      // 3. Get old Cloudinary ID to delete it
      const oldData = await pool.query('SELECT cloudinary_id FROM users WHERE id = $1', [id]);
      if (oldData.rowCount > 0 && oldData.rows[0].cloudinary_id) {
        await cloudinary.uploader.destroy(oldData.rows[0].cloudinary_id);
      }

      // 4. Update query with image and embedding info
      updateQuery += ', face_embedding = $4, image_url = $5, cloudinary_id = $6 WHERE id = $7 RETURNING id';
      queryParams.push(JSON.stringify(embedding), cloudinaryResponse.secure_url, cloudinaryResponse.public_id, id);
    } else {
      updateQuery += ' WHERE id = $4 RETURNING id';
      queryParams.push(id);
    }

    const result = await pool.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Clean up temp file
    if (imageFile && fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    res.json({ message: 'Teacher updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Retrieves the profile details for the currently logged-in teacher.
 */
export const getMyProfile = async (req, res) => {
  const teacherId = req.user.id;
  try {
    const { rows: teachers } = await pool.query(
      'SELECT id, name, email, college_id, role, image_url FROM users WHERE id = $1',
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
