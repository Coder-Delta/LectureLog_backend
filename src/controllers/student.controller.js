import pool from '../config/database.config.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cloudinary from '../config/cloudinary.config.js';
import { sendDirectNotification } from '../services/notification.service.js';
import { sendWelcomeRegistrationEmail } from '../services/email.service.js';

dotenv.config();

/**
 * Registers a new student in the system.
 * 1. Takes the student's details and photo.
 * 2. Sends the photo to the AI service to generate a face embedding (JSON vector).
 * 3. Saves the student data and the AI embedding into PostgreSQL.
 * 4. Saves the physical photo to the local file system.
 */
export const registerStudent = async (req, res) => {
  const { name, email, roll_number, college_id, year, stream } = req.body;
  const imageFile = req.file;

  if (!imageFile) {
    return res.status(400).json({ message: 'Student photo is required for registration' });
  }

  try {
    let embedding = null;
    // face_embeddings is an array of embeddings (multi-angle), sent as JSON string from frontend
    let embeddingsArray = null;

    // 1. Check if multi-angle embeddings array is provided (new flow)
    if (req.body.face_embeddings) {
      try {
        embeddingsArray = JSON.parse(req.body.face_embeddings);
      } catch (e) { embeddingsArray = null; }
    }

    // 2. Check if single embedding is provided (Electron single-photo legacy flow)
    if (!embeddingsArray && req.body.face_embedding) {
      try {
        embedding = JSON.parse(req.body.face_embedding);
        if (Array.isArray(embedding) && Array.isArray(embedding[0])) {
          // It's actually a multi-angle array
          embeddingsArray = embedding;
          embedding = embeddingsArray[0];
        }
      } catch (e) {
        embedding = req.body.face_embedding;
      }
    }

    // 3. If nothing provided, get embedding from AI Service (web/fallback flow)
    if (!embeddingsArray && !embedding) {
      try {
        const aiFormData = new FormData();
        aiFormData.append('file', fs.createReadStream(imageFile.path));
        const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'}/embed`, aiFormData, {
          headers: aiFormData.getHeaders(),
          timeout: 8000
        });
        embedding = aiResponse.data.embedding;
      } catch (aiErr) {
        console.error('AI Service Error:', aiErr.message);
        throw new Error(`AI Recognition Service is unreachable or timed out (${aiErr.message}). Please ensure the local AI service is running and healthy.`);
      }
    }

    // For backward compat: primary embedding is first of array, or the single one
    const primaryEmbedding = embeddingsArray ? embeddingsArray[0] : embedding;
    if (!primaryEmbedding || !Array.isArray(primaryEmbedding)) {
      throw new Error('AI Service failed to generate a valid face embedding.');
    }

    // 2. Upload to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(imageFile.path, {
      folder: 'Merge/students',
    });

    // 3. Save to PostgreSQL — store both single embedding (backward compat) AND full array
    const organization_id = req.user.organization_id;
    const result = await pool.query(
      'INSERT INTO students (name, email, roll_number, college_id, year, stream, face_embedding, face_embeddings, image_url, cloudinary_id, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
      [
        name,
        email,
        roll_number,
        college_id,
        year,
        stream,
        JSON.stringify(primaryEmbedding),
        JSON.stringify(embeddingsArray || [primaryEmbedding]),
        cloudinaryResponse.secure_url,
        cloudinaryResponse.public_id,
        organization_id
      ]
    );
    const studentId = result.rows[0].id;

    // Clean up temp file
    if (fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    // Send Welcome & Activation Email asynchronously
    sendWelcomeRegistrationEmail({
      name,
      email,
      role: 'student',
      organization_id
    });

    res.status(201).json({ message: 'Student registered successfully', studentId, image_url: cloudinaryResponse.secure_url });
  } catch (err) {
    console.error('Registration Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    res.status(500).json({ message: err.response?.data?.error || err.message });
  }
};

/**
 * Add additional face angle embeddings to an existing student.
 * Accepts multiple image files. Generates embeddings in parallel and
 * merges them with the student's existing face_embeddings array.
 */
export const addStudentAngles = async (req, res) => {
  const { id } = req.params;
  const imageFiles = req.files;
  const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';

  // Accept either uploaded files OR pre-computed embeddings from Electron
  let newEmbeddings = [];

  if (req.body.face_embeddings) {
    try {
      newEmbeddings = JSON.parse(req.body.face_embeddings);
    } catch (e) { newEmbeddings = []; }
  }

  if (newEmbeddings.length === 0 && (!imageFiles || imageFiles.length === 0)) {
    return res.status(400).json({ message: 'At least one image or embedding is required' });
  }

  try {
    // Generate embeddings for all uploaded files in parallel (fast!)
    if (imageFiles && imageFiles.length > 0) {
      const embedTasks = imageFiles.map(async (imgFile) => {
        try {
          const aiFormData = new FormData();
          aiFormData.append('file', fs.createReadStream(imgFile.path));
          const aiResponse = await axios.post(`${AI_URL}/embed`, aiFormData, {
            headers: aiFormData.getHeaders(),
            timeout: 15000
          });
          return aiResponse.data.embedding;
        } catch (e) {
          console.error(`Embedding failed for ${imgFile.originalname}:`, e.message);
          return null;
        } finally {
          if (fs.existsSync(imgFile.path)) fs.unlinkSync(imgFile.path);
        }
      });
      const results = await Promise.all(embedTasks);
      newEmbeddings = [...newEmbeddings, ...results.filter(Boolean)];
    }

    if (newEmbeddings.length === 0) {
      return res.status(422).json({ message: 'Could not extract valid embeddings from the provided images.' });
    }

    // Fetch existing embeddings and merge
    const { rows } = await pool.query('SELECT face_embeddings, face_embedding FROM students WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Student not found' });

    let existing = rows[0].face_embeddings || [];
    if (!Array.isArray(existing)) existing = [];
    // Also migrate legacy single embedding into the array if not already done
    if (existing.length === 0 && rows[0].face_embedding) {
      existing = [rows[0].face_embedding];
    }

    const merged = [...existing, ...newEmbeddings];

    await pool.query(
      'UPDATE students SET face_embeddings = $1 WHERE id = $2',
      [JSON.stringify(merged), id]
    );

    res.json({ message: `${newEmbeddings.length} angle(s) added. Total: ${merged.length}`, total_angles: merged.length });
  } catch (err) {
    console.error('Add angles error:', err);
    if (imageFiles) imageFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Retrieves all registered students from the database.
 * Used primarily for the admin dashboard.
 */
export const getStudents = async (req, res) => {
  try {
    const organization_id = req.user?.organization_id || req.query.organization_id;
    
    if (!organization_id) {
      return res.status(400).json({ message: 'Organization context missing' });
    }

    const { rows: students } = await pool.query(
      `SELECT id, name, email, roll_number, college_id, year, stream, face_embedding, face_embeddings,
        image_url, created_at FROM students WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organization_id]
    );

    const processedStudents = students.map(s => {
      let angleCount = 0;
      if (s.face_embeddings && Array.isArray(s.face_embeddings)) {
        angleCount = s.face_embeddings.length;
      } else if (s.face_embedding) {
        angleCount = 1;
      }
      return { ...s, angle_count: angleCount };
    });

    res.json(processedStudents);
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
      SELECT a.*, s.start_time, s.schedule_id, sub.id as subject_id, sub.name as subject_name
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
    // 1. Get Cloudinary ID from DB
    const studentResult = await pool.query('SELECT cloudinary_id FROM students WHERE id = $1', [id]);
    
    if (studentResult.rowCount > 0) {
      const { cloudinary_id } = studentResult.rows[0];
      if (cloudinary_id) {
        // Delete from Cloudinary
        await cloudinary.uploader.destroy(cloudinary_id);
      }
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

/**
 * Updates a student's basic details (name, email, roll_number, college_id, year).
 * Does not update the photo/embedding.
 */
export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const { name, email, roll_number, college_id, year, stream } = req.body;
  const imageFile = req.file;

  try {
    let updateQuery = 'UPDATE students SET name = $1, email = $2, roll_number = $3, college_id = $4, year = $5, stream = $6';
    let queryParams = [name, email, roll_number, college_id, year, stream];
    
    if (imageFile) {
      let embedding = null;

      // 1. Check if embedding is already provided
      if (req.body.face_embedding) {
        try {
          embedding = JSON.parse(req.body.face_embedding);
        } catch (e) {
          embedding = req.body.face_embedding;
        }
      }

      // 2. If no embedding provided, get it from AI Service
      if (!embedding) {
        try {
          const aiFormData = new FormData();
          aiFormData.append('file', fs.createReadStream(imageFile.path));

          const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'}/embed`, aiFormData, {
            headers: aiFormData.getHeaders(),
            timeout: 8000
          });

          embedding = aiResponse.data.embedding;
        } catch (aiErr) {
          console.error('AI Service Error:', aiErr.message);
          throw new Error(`AI Recognition Service is unreachable or timed out (${aiErr.message}). Please ensure the local AI service is running and healthy.`);
        }
      }

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('AI Service failed to generate a valid face embedding.');
      }

      // 2. Upload new image to Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.upload(imageFile.path, {
        folder: 'Merge/students',
      });

      // 3. Get old Cloudinary ID to delete it
      const oldData = await pool.query('SELECT cloudinary_id FROM students WHERE id = $1', [id]);
      if (oldData.rowCount > 0 && oldData.rows[0].cloudinary_id) {
        await cloudinary.uploader.destroy(oldData.rows[0].cloudinary_id);
      }

      // 4. Update query with image and embedding info
      updateQuery += ', face_embedding = $7, image_url = $8, cloudinary_id = $9 WHERE id = $10 RETURNING id';
      queryParams.push(JSON.stringify(embedding), cloudinaryResponse.secure_url, cloudinaryResponse.public_id, id);
    } else {
      updateQuery += ' WHERE id = $7 RETURNING id';
      queryParams.push(id);
    }

    const result = await pool.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Clean up temp file
    if (imageFile && fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    sendDirectNotification({
      receiver_id: id,
      receiver_role: 'student',
      type: 'profile-update',
      session_type: 'regular',
      priority: 'normal',
      title: 'Profile Updated',
      message: 'Your profile information was updated by Admin. Please check your profile.',
      redirect_url: '/you',
      expires_in_days: 90
    });

    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    res.status(500).json({ message: err.message });
  }
};
/**
 * Retrieves the profile details for the currently logged-in student.
 */
export const getMyProfile = async (req, res) => {
  const studentId = req.user.id;
  try {
    const { rows: students } = await pool.query(
      'SELECT s.id, s.name, s.email, s.roll_number, s.college_id, s.year, s.stream, s.image_url, s.organization_id, o.name as organization FROM students s LEFT JOIN organizations o ON s.organization_id = o.id WHERE s.id = $1',
      [studentId]
    );
    if (students.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json({ ...students[0], role: 'student' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
