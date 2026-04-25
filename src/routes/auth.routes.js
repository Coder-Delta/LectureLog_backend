import express from 'express';
import { signup, login, adminLogin, studentLogin } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.post('/student/login', studentLogin);

export default router;
