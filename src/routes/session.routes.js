import express from 'express';
import { startSession, endSession, getSessions } from '../controllers/session.controller.js';

const router = express.Router();

router.post('/start', startSession);
router.post('/end', endSession);
router.get('/', getSessions);

export default router;
