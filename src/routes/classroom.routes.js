import express from 'express';
import {
  getClassrooms,
  addClassroom,
  updateClassroom,
  deleteClassroom
} from '../controllers/classroom.controller.js';

const router = express.Router();

router.get('/', getClassrooms);
router.post('/', addClassroom);
router.put('/:id', updateClassroom);
router.delete('/:id', deleteClassroom);

export default router;
