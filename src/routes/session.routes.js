import express from 'express';
import { startSession, endSession, getSessions, cancelSession } from '../controllers/session.controller.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/start', authenticateToken, authorizeRole('teacher', 'admin'), startSession);
router.post('/end', authenticateToken, authorizeRole('teacher', 'admin'), endSession);
router.post('/cancel', authenticateToken, authorizeRole('teacher', 'admin'), cancelSession);
router.get('/', authenticateToken, authorizeRole('teacher', 'admin', 'student'), getSessions);

export default router;
