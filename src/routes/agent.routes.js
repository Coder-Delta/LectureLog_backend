import express from 'express';
import { getAttendanceReports, getMonitoringData } from '../controllers/agent.controller.js';

const router = express.Router();

router.get('/reports', getAttendanceReports);
router.get('/monitoring', getMonitoringData);

export default router;
