# LectureLog Backend

AI-Based Smart Attendance System Backend.

## Features
- Session-based attendance tracking
- Face recognition integration (via Python AI Service)
- Pinecone Vector Database integration for student embeddings
- Real-time dashboard updates using WebSockets
- Agent-based reporting and monitoring
- Student recheck request system
- PostgreSQL-backed API only, with legacy in-memory routes removed

## Tech Stack
- Node.js & Express
- PostgreSQL (Data persistence)
- Pinecone (Vector search)
- Socket.io (Real-time updates)
- JWT (Authentication)

## Getting Started

### Prerequisites
- Node.js (v16+)
- PostgreSQL Server
- Pinecone Account (optional but recommended for full features)

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example` and fill in your credentials.
4. Initialize the database:
   ```bash
   node init-db.js
   ```
5. Start the development server:
   ```bash
   npm run start
   ```

## Backend Structure
- `src/controllers/`: request handlers for the Postgres-backed API
- `src/routes/`: active Express routes for auth, students, sessions, attendance, recheck, recognition, schedules, and agent reports
- `src/config/database.config.js`: PostgreSQL pool and startup connection check
- `src/services/scheduler.service.js`: cron-driven automatic session lifecycle
- `init-db.js`: idempotent schema bootstrap for PostgreSQL
- `setup_test_data.js`: optional seed data for local testing

## API Endpoints

### Auth
- `POST /api/auth/signup` - Create a new teacher/admin account
- `POST /api/auth/login` - Login and get JWT token

### Sessions
- `POST /api/sessions/start` - Start a new class session
- `POST /api/sessions/end` - End an active session
- `GET /api/sessions` - Get all sessions

### Students
- `POST /api/students` - Register a new student (optionally with embedding)
- `GET /api/students` - List all students

### Recognition
- `POST /api/recognition` - Endpoint for AI service to push recognition results

### Attendance
- `GET /api/attendance/session/:id` - Get attendance records for a specific session
- `POST /api/attendance` - Manually mark/override attendance

### Recheck
- `POST /api/recheck` - Submit a recheck request (student)
- `GET /api/recheck` - List all recheck requests (teacher)
- `PATCH /api/recheck/status` - Approve or reject a request

### Schedule
- `POST /api/schedule` - Create an automated class schedule
- `GET /api/schedule` - List schedules
- `GET /api/schedule/my` - List schedules for the logged-in teacher
- `PUT /api/schedule/:id` - Update schedule timing

### Agent
- `GET /api/agent/reports` - Get subject-wise attendance reports
- `GET /api/agent/monitoring` - Detect students with low attendance patterns

## Environment Variables
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=lecturelog
DB_SSL=false
JWT_SECRET=replace_me
AI_SERVICE_URL=http://localhost:8000
PINECONE_API_KEY=replace_me
PINECONE_ENVIRONMENT=replace_me
PINECONE_INDEX=lecturelog-embeddings
PINECONE_API_KEY_TWO=replace_me
```
