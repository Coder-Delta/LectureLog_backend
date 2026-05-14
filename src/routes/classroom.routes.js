import express from 'express';
import {
  getClassrooms,
  addClassroom,
  updateClassroom,
  deleteClassroom
} from '../controllers/classroom.controller.js';

import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, getClassrooms);
router.post('/', authenticateToken, addClassroom);
router.put('/:id', authenticateToken, updateClassroom);
router.delete('/:id', authenticateToken, deleteClassroom);

export default router;
