import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  registerTeacher,
  updateTeacher,
  getTeachers,
  deleteTeacher,
  getMyProfile
} from '../controllers/teacher.controller.js';

const router = express.Router();

// Setup Multer for saving uploaded teacher images temporarily
const upload = multer({ dest: 'uploads/' });

router.get('/me', authenticateToken, getMyProfile);
router.post('/', authenticateToken, upload.single('image'), registerTeacher);
router.put('/:id', authenticateToken, upload.single('image'), updateTeacher);
router.get('/', authenticateToken, getTeachers);
router.delete('/:id', authenticateToken, deleteTeacher);

export default router;
