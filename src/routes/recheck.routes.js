import express from 'express';
import { createRecheckRequest, getRecheckRequests, updateRecheckStatus } from '../controllers/recheck.controller.js';

const router = express.Router();

router.post('/', createRecheckRequest);
router.get('/', getRecheckRequests);
router.patch('/status', updateRecheckStatus);

export default router;
