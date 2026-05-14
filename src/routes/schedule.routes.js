import express from 'express';
import { createSchedule, getMySchedules, updateSchedule, getSchedules, deleteSchedule, cancelSchedule } from '../controllers/schedule.controller.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, getSchedules);
router.get('/my', authenticateToken, authorizeRole('teacher'), getMySchedules);
router.post('/', authenticateToken, authorizeRole('admin'), createSchedule);
router.put('/:id', authenticateToken, authorizeRole('admin'), updateSchedule);
router.delete('/:id', authenticateToken, authorizeRole('admin'), deleteSchedule);
router.post('/:id/cancel', authenticateToken, authorizeRole('teacher'), cancelSchedule);

export default router;
