import express from 'express';
import { startSession, endSession, getSessions, cancelSession, endBySchedule, deleteCustomSession } from '../controllers/session.controller.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/start', authenticateToken, authorizeRole('teacher', 'admin'), startSession);
router.post('/end', authenticateToken, authorizeRole('teacher', 'admin'), endSession);
router.post('/end-by-schedule', authenticateToken, authorizeRole('teacher', 'admin'), endBySchedule);
router.post('/cancel', authenticateToken, authorizeRole('teacher', 'admin'), cancelSession);
router.delete('/:id', authenticateToken, authorizeRole('admin'), deleteCustomSession);

// Public route for AI Service synchronization
router.get('/public', getSessions);
router.get('/', authenticateToken, getSessions);

export default router;
