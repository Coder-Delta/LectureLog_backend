import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  createCancelRequest,
  createHandoverRequest,
  approveRequest,
  getRequests
} from '../controllers/requests.controller.js';

const router = express.Router();

router.get('/', authenticateToken, getRequests);
router.post('/cancel', authenticateToken, createCancelRequest);
router.post('/handover', authenticateToken, createHandoverRequest);
router.post('/:id/action', authenticateToken, approveRequest);

export default router;
