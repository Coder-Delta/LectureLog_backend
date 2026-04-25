import express from 'express';
import { processRecognition } from '../controllers/recognition.controller.js';

const router = express.Router();

router.post('/', processRecognition);

export default router;
