# LectureLog Backend

AI-Based Smart Attendance System Backend.

## Features
- Session-based attendance tracking
- Face recognition integration (via Python AI Service)
- Pinecone Vector Database integration for student embeddings
- Real-time dashboard updates using WebSockets
- Agent-based reporting and monitoring
- Student recheck request system

## Tech Stack
- Node.js & Express
- MySQL (Data persistence)
- Pinecone (Vector search)
- Socket.io (Real-time updates)
- JWT (Authentication)

## Getting Started

### Prerequisites
- Node.js (v16+)
- MySQL Server
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

### Agent
- `GET /api/agent/reports` - Get subject-wise attendance reports
- `GET /api/agent/monitoring` - Detect students with low attendance patterns
