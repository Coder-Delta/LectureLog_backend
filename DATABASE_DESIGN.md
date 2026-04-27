# LectureLog Database Design

## Runtime Database

LectureLog now runs only on PostgreSQL.

Connection values come from `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=lecturelog
DB_SSL=false
```

`DATABASE_URL` or `POSTGRES_URL` can also be used instead of the individual fields.

## Active Tables

### `users`

- Stores teacher and admin accounts
- Important columns: `name`, `email`, `password`, `role`, `created_at`
- Roles allowed: `teacher`, `admin`

### `students`

- Stores student profiles used by attendance and recognition
- Important columns: `name`, `email`, `roll_number`, `college_id`, `year`, `face_embedding`, `status`, `created_at`
- Unique constraints: `email`, `roll_number`, `(roll_number, college_id)`

### `subjects`

- Stores lecture subjects
- Important columns: `name`
- Unique constraint: `name`

### `classrooms`

- Stores room and camera information
- Important columns: `name`, `camera_url`
- Unique constraint: `name`

### `sessions`

- Stores started or completed lecture sessions
- Important columns: `subject_id`, `classroom_id`, `teacher_id`, `start_time`, `end_time`, `status`
- Status allowed: `active`, `ended`

### `attendance`

- Stores student attendance per session
- Important columns: `student_id`, `session_id`, `status`, `marked_at`
- Status allowed: `present`, `absent`
- Unique constraint: `(student_id, session_id)`

### `recheck_requests`

- Stores attendance dispute requests
- Important columns: `student_id`, `session_id`, `message`, `status`, `created_at`
- Status allowed: `pending`, `approved`, `rejected`

### `schedules`

- Stores automated timetable entries used by the scheduler
- Important columns: `subject_id`, `classroom_id`, `teacher_id`, `day_of_week`, `start_time`, `end_time`, `year`, `camera_id`
- Allowed `year` values: `1`, `2`, `3`, `4`

## Relationships

- `sessions.subject_id -> subjects.id`
- `sessions.classroom_id -> classrooms.id`
- `sessions.teacher_id -> users.id`
- `attendance.student_id -> students.id`
- `attendance.session_id -> sessions.id`
- `recheck_requests.student_id -> students.id`
- `recheck_requests.session_id -> sessions.id`
- `schedules.subject_id -> subjects.id`
- `schedules.classroom_id -> classrooms.id`
- `schedules.teacher_id -> users.id`

## Source of Truth

- Runtime connection and pooling: `src/config/database.config.js`
- Schema bootstrap: `init-db.js`
- Seed data: `setup_test_data.js`
- Scheduler usage: `src/services/scheduler.service.js`

This document reflects the current codebase, not a future ORM design.
