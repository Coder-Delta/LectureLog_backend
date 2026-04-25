import express from 'express';
import multer from 'multer';
import { registerStudent, getStudents, getMyAttendance, getMyStats, deleteStudent } from '../controllers/student.controller.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/', authenticateToken, authorizeRole('teacher', 'admin'), upload.single('image'), registerStudent);
router.get('/', getStudents);
router.get('/my-attendance', authenticateToken, getMyAttendance);
router.get('/my-stats', authenticateToken, getMyStats);
router.delete('/:id', authenticateToken, authorizeRole('admin'), deleteStudent);

export default router;
