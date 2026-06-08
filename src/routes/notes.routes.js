import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  uploadNote,
  getNotes
} from '../controllers/notes.controller.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lecturelog_notes',
    resource_type: 'auto' // allows pdf, images, etc
  },
});
const upload = multer({ storage: storage });

router.get('/', authenticateToken, getNotes);
router.post('/upload', authenticateToken, upload.single('file'), uploadNote);

export default router;
