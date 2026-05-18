import express from 'express';
import { getMyNotifications, markAsRead, markAllAsRead, deleteNotification, clearAllReadNotifications, savePushToken } from '../controllers/notification.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/push-token', savePushToken);
router.get('/', getMyNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/clear-read', clearAllReadNotifications);
router.delete('/:id', deleteNotification);

export default router;
