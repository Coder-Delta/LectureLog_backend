import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import studentRoutes from './routes/student.routes.js';
import sessionRoutes from './routes/session.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import recheckRoutes from './routes/recheck.routes.js';
import agentRoutes from './routes/agent.routes.js';
import recognitionRoutes from './routes/recognition.routes.js';
import authRoutes from './routes/auth.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import { initScheduler } from './services/scheduler.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

// Ensure folders exist
const uploadDir = 'uploads';
const studentImgDir = 'public/students';
[uploadDir, 'public', studentImgDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow serving images
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use('/public', express.static('public'));

// Socket.io initialization
app.set('io', io);
initScheduler(app);
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Routes
app.use('/api/students', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/recheck', recheckRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/recognition', recognitionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/schedules', scheduleRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
