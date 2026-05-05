import fs from 'fs';
import path from 'path';
import pool from './src/config/database.config.js';
import cloudinary from './src/config/cloudinary.config.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateImages = async () => {
  console.log('🚀 Starting migration to Cloudinary...');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Error: Cloudinary credentials missing in .env file.');
    process.exit(1);
  }

  // 1. Migrate Students
  const studentDir = path.join('public', 'students');
  if (fs.existsSync(studentDir)) {
    const studentFiles = fs.readdirSync(studentDir).filter(f => f.endsWith('.jpg'));
    console.log(`📸 Found ${studentFiles.length} student images.`);

    for (const file of studentFiles) {
      const id = path.parse(file).name;
      const filePath = path.join(studentDir, file);

      try {
        console.log(`⏳ Uploading student ${id}...`);
        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'lecturelog/students',
          public_id: `student_${id}`
        });

        await pool.query(
          'UPDATE students SET image_url = $1, cloudinary_id = $2 WHERE id = $3',
          [result.secure_url, result.public_id, id]
        );
        console.log(`✅ Student ${id} migrated.`);
      } catch (err) {
        console.error(`❌ Failed to migrate student ${id}:`, err.message);
      }
    }
  }

  // 2. Migrate Teachers
  const teacherDir = path.join('public', 'teachers');
  if (fs.existsSync(teacherDir)) {
    const teacherFiles = fs.readdirSync(teacherDir).filter(f => f.endsWith('.jpg'));
    console.log(`📸 Found ${teacherFiles.length} teacher images.`);

    for (const file of teacherFiles) {
      const id = path.parse(file).name;
      const filePath = path.join(teacherDir, file);

      try {
        console.log(`⏳ Uploading teacher ${id}...`);
        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'lecturelog/teachers',
          public_id: `teacher_${id}`
        });

        await pool.query(
          'UPDATE users SET image_url = $1, cloudinary_id = $2 WHERE id = $3 AND role = \'teacher\'',
          [result.secure_url, result.public_id, id]
        );
        console.log(`✅ Teacher ${id} migrated.`);
      } catch (err) {
        console.error(`❌ Failed to migrate teacher ${id}:`, err.message);
      }
    }
  }

  console.log('🎉 Migration completed!');
  process.exit(0);
};

migrateImages();
