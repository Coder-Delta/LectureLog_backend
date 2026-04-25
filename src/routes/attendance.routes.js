import express from 'express';
import { getSessionAttendance, markManualAttendance } from '../controllers/attendance.controller.js';

const router = express.Router();

router.get('/session/:id', getSessionAttendance);
router.post('/', markManualAttendance);

export default router;
