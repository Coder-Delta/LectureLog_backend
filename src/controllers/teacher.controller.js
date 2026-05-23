import pool from '../config/database.config.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import cloudinary from '../config/cloudinary.config.js';
import { sendDirectNotification } from '../services/notification.service.js';
import { sendWelcomeRegistrationEmail } from '../services/email.service.js';

/**
 * Register a new teacher
 */
export const registerTeacher = async (req, res) => {
  const { name, email, college_id } = req.body;
  const imageFile = req.files ? req.files.find(f => f.fieldname === 'image') : req.file;

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

    // 1. Get embedding (Check if provided by Electron app first)
    let embedding = null;
    if (req.body.face_embedding) {
      try {
        embedding = JSON.parse(req.body.face_embedding);
      } catch (e) {
        embedding = req.body.face_embedding;
      }
    }

    // 2. If no embedding provided, call AI Service (Legacy/Web flow)
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

    // 2. Upload to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(imageFile.path, {
      folder: 'Merge/teachers',
    });

    // 2.5 Upload extra angles to Cloudinary
    const extraImages = req.files ? req.files.filter(f => f.fieldname.startsWith('image_')) : [];
    const angleImages = {};
    for (const img of extraImages) {
      const angleKey = img.fieldname.replace('image_', '');
      const cRes = await cloudinary.uploader.upload(img.path, { folder: 'Merge/teachers' });
      angleImages[angleKey] = { url: cRes.secure_url, id: cRes.public_id };
      if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
    }

    // 3. Save to PostgreSQL
    const organization_id = req.user.organization_id;
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, college_id, face_embedding, image_url, cloudinary_id, organization_id, angle_images) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [
        name, 
        email, 
        hashedPassword, 
        'teacher', 
        college_id, 
        JSON.stringify(embedding),
        cloudinaryResponse.secure_url, 
        cloudinaryResponse.public_id,
        organization_id,
        JSON.stringify(angleImages)
      ]
    );
    const teacherId = result.rows[0].id;

    // Clean up temp file
    if (fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    // Send Welcome & Activation Email asynchronously
    sendWelcomeRegistrationEmail({
      name,
      email,
      role: 'teacher',
      organization_id
    });

    res.status(201).json({ message: 'Teacher registered successfully', teacherId, image_url: cloudinaryResponse.secure_url });
  } catch (err) {
    console.error('Full Registration Error:', err);
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    
    // TEMPORARY: Return full error for debugging cloud-side
    res.status(500).json({ 
      message: 'Error registering teacher', 
      error: err.message,
      stack: err.stack,
      debugInfo: {
        hasUser: !!req.user,
        orgId: req.user?.organization_id,
        bodyFields: Object.keys(req.body)
      }
    });
  }
};

/**
 * Add additional face angle embeddings to an existing teacher.
 * Accepts multiple image files, generates embeddings in parallel, merges with existing.
 */
export const addTeacherAngles = async (req, res) => {
  const { id } = req.params;
  const imageFiles = req.files;
  const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';

  let newEmbeddings = [];
  if (req.body.face_embeddings) {
    try { newEmbeddings = JSON.parse(req.body.face_embeddings); } catch (e) { newEmbeddings = []; }
  }

  if (newEmbeddings.length === 0 && (!imageFiles || imageFiles.length === 0)) {
    return res.status(400).json({ message: 'At least one image or embedding is required' });
  }

  try {
    let uploadedAngles = {};

    if (imageFiles && imageFiles.length > 0) {
      const embedTasks = imageFiles.map(async (imgFile) => {
        try {
          const aiFormData = new FormData();
          aiFormData.append('file', fs.createReadStream(imgFile.path));
          const aiResponse = await axios.post(`${AI_URL}/embed`, aiFormData, {
            headers: aiFormData.getHeaders(), timeout: 15000
          });
          
          const angleKey = imgFile.fieldname.replace('image_', '');
          const cRes = await cloudinary.uploader.upload(imgFile.path, { folder: 'Merge/teachers' });
          uploadedAngles[angleKey] = { url: cRes.secure_url, id: cRes.public_id };

          return aiResponse.data.embedding;
        } catch (e) {
          console.error(`Processing failed for ${imgFile.originalname}:`, e.message);
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

    const { rows } = await pool.query("SELECT face_embeddings, face_embedding, angle_images FROM users WHERE id = $1 AND role = 'teacher'", [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Teacher not found' });

    let existing = rows[0].face_embeddings || [];
    if (!Array.isArray(existing)) existing = [];
    if (existing.length === 0 && rows[0].face_embedding) existing = [rows[0].face_embedding];

    const merged = [...existing, ...newEmbeddings];
    
    let currentAngleImages = rows[0].angle_images || {};
    for (const [key, data] of Object.entries(uploadedAngles)) {
      if (currentAngleImages[key] && currentAngleImages[key].id) {
        await cloudinary.uploader.destroy(currentAngleImages[key].id).catch(() => {});
      }
      currentAngleImages[key] = data;
    }

    await pool.query('UPDATE users SET face_embeddings = $1, angle_images = $2 WHERE id = $3', [JSON.stringify(merged), JSON.stringify(currentAngleImages), id]);

    res.json({ message: `${newEmbeddings.length} angle(s) added. Total: ${merged.length}`, total_angles: merged.length });
  } catch (err) {
    console.error('Add teacher angles error:', err);
    if (imageFiles) imageFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get all teachers
 */
export const getTeachers = async (req, res) => {
  try {
    const { rows: teachers } = await pool.query(
      `SELECT id, name, email, college_id, image_url, created_at, face_embedding, face_embeddings, angle_images
        FROM users WHERE role = 'teacher' ORDER BY created_at DESC`
    );
    const processedTeachers = teachers.map(t => {
      let angleCount = 0;
      if (t.face_embeddings && Array.isArray(t.face_embeddings)) {
        angleCount = t.face_embeddings.length;
      } else if (t.face_embedding) {
        angleCount = 1;
      }
      // Don't send embeddings back to client
      const { face_embedding, face_embeddings, ...rest } = t;
      return { ...rest, angle_count: angleCount };
    });
    res.json(processedTeachers);
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
    // 1. Get Cloudinary ID and angle images
    const teacherResult = await pool.query("SELECT cloudinary_id, angle_images FROM users WHERE id = $1 AND role = 'teacher'", [id]);
    if (teacherResult.rowCount > 0) {
      const { cloudinary_id, angle_images } = teacherResult.rows[0];
      if (cloudinary_id) {
        await cloudinary.uploader.destroy(cloudinary_id).catch(() => {});
      }
      if (angle_images) {
        for (const key in angle_images) {
          if (angle_images[key] && angle_images[key].id) {
            await cloudinary.uploader.destroy(angle_images[key].id).catch(() => {});
          }
        }
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
  const imageFile = req.files ? req.files.find(f => f.fieldname === 'image') : req.file;
  const extraImages = req.files ? req.files.filter(f => f.fieldname.startsWith('image_')) : [];

  try {
    let updateQuery = 'UPDATE users SET name = $1, email = $2, college_id = $3';
    let queryParams = [name, email, college_id];
    let paramIndex = 4;

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

      // 2. If no embedding provided, call AI Service
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
        folder: 'Merge/teachers',
      });

      // 3. Get old Cloudinary ID to delete it
      const oldData = await pool.query('SELECT cloudinary_id FROM users WHERE id = $1', [id]);
      if (oldData.rowCount > 0 && oldData.rows[0].cloudinary_id) {
        await cloudinary.uploader.destroy(oldData.rows[0].cloudinary_id);
      }

      // 4. Update query with image and embedding info
      updateQuery += `, face_embedding = $${paramIndex}, image_url = $${paramIndex+1}, cloudinary_id = $${paramIndex+2}`;
      queryParams.push(JSON.stringify(embedding), cloudinaryResponse.secure_url, cloudinaryResponse.public_id);
      paramIndex += 3;
    }
    
    if (extraImages.length > 0) {
      // Get existing angle images to merge
      const oldData = await pool.query('SELECT angle_images FROM users WHERE id = $1', [id]);
      let currentAngleImages = oldData.rowCount > 0 && oldData.rows[0].angle_images ? oldData.rows[0].angle_images : {};
      
      for (const img of extraImages) {
        const angleKey = img.fieldname.replace('image_', '');
        
        // Delete old angle image if exists
        if (currentAngleImages[angleKey] && currentAngleImages[angleKey].id) {
          await cloudinary.uploader.destroy(currentAngleImages[angleKey].id).catch(() => {});
        }
        
        const cRes = await cloudinary.uploader.upload(img.path, { folder: 'Merge/teachers' });
        currentAngleImages[angleKey] = { url: cRes.secure_url, id: cRes.public_id };
        if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
      }
      
      updateQuery += `, angle_images = $${paramIndex}`;
      queryParams.push(JSON.stringify(currentAngleImages));
      paramIndex++;
    }

    updateQuery += ` WHERE id = $${paramIndex} RETURNING id`;
    queryParams.push(id);

    const result = await pool.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Clean up temp file
    if (imageFile && fs.existsSync(imageFile.path)) {
      fs.unlinkSync(imageFile.path);
    }

    sendDirectNotification({
      receiver_id: id,
      receiver_role: 'teacher',
      type: 'profile-update',
      session_type: 'regular',
      priority: 'normal',
      title: 'Profile Updated',
      message: 'Your profile information was updated by Admin. Please check your profile.',
      redirect_url: '/profile',
      expires_in_days: 90
    });

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
      'SELECT u.id, u.name, u.email, u.college_id, u.role, u.image_url, o.name as organization FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.id = $1',
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
