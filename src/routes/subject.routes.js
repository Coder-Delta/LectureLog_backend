import express from 'express';
import {
  getSubjects,
  addSubject,
  updateSubject,
  deleteSubject
} from '../controllers/subject.controller.js';

import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, getSubjects);
router.post('/', authenticateToken, addSubject);
router.put('/:id', authenticateToken, updateSubject);
router.delete('/:id', authenticateToken, deleteSubject);

export default router;
