import express from 'express';
import { createSchedule, getMySchedules, updateSchedule, getSchedules } from '../controllers/schedule.controller.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, authorizeRole('teacher', 'admin'), getSchedules);
router.get('/my', authenticateToken, authorizeRole('teacher'), getMySchedules);
router.post('/', authenticateToken, authorizeRole('teacher', 'admin'), createSchedule);
router.put('/:id', authenticateToken, authorizeRole('teacher', 'admin'), updateSchedule);

export default router;
