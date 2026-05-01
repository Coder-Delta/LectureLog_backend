import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  registerTeacher,
  getTeachers,
  deleteTeacher,
  getMyProfile
} from '../controllers/teacher.controller.js';

const router = express.Router();

// Setup Multer for saving uploaded teacher images temporarily
const upload = multer({ dest: 'uploads/' });

router.get('/me', authenticateToken, getMyProfile);
router.post('/', upload.single('image'), registerTeacher);
router.get('/', getTeachers);
router.delete('/:id', deleteTeacher);

export default router;
