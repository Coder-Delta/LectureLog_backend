import express from 'express';
import { globalSearch, attendanceSearch, sessionSearch } from '../controllers/search.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/global', globalSearch);
router.get('/attendance', attendanceSearch);
router.get('/sessions', sessionSearch);

export default router;
