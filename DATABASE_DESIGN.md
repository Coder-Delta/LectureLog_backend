# LectureLog SQL Database Design

## Recommended database

PostgreSQL is the best fit here because LectureLog has clear relational data:
students, classrooms, subjects, sessions, attendance records, and recheck workflows.

Connection target:

```env
DB_PROVIDER=postgresql
DB_NAME=lecturelog
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/lecturelog
```

## Core tables

### `users`

- Purpose: admins, faculty, and user accounts linked to students
- Key columns: `name`, `email`, `password_hash`, `role`, `is_active`, `last_login_at`
- Constraints: unique `email`, role check

### `classrooms`

- Purpose: room metadata and device/camera setup
- Key columns: `name`, `code`, `building`, `floor`, `capacity`, `camera_url`, `device_status`
- Constraints: unique `name`, optional unique `code`, positive capacity

### `students`

- Purpose: student profile and classroom assignment
- Key columns: `user_id`, `roll_number`, `name`, `email`, `classroom_id`, `face_embedding_id`
- Constraints: unique `roll_number`, unique `email`
- Foreign keys: `user_id -> users.id`, `classroom_id -> classrooms.id`

### `subjects`

- Purpose: academic subject owned by faculty and optionally linked to a classroom
- Key columns: `name`, `code`, `department`, `semester`, `credits`, `faculty_id`, `classroom_id`
- Foreign keys: `faculty_id -> users.id`, `classroom_id -> classrooms.id`

### `student_subjects`

- Purpose: join table for student enrollment in subjects
- Key columns: `student_id`, `subject_id`
- Constraints: unique pair `student_id + subject_id`

### `sessions`

- Purpose: one lecture occurrence
- Key columns: `subject_id`, `classroom_id`, `faculty_id`, `start_time`, `end_time`, `actual_start_time`, `actual_end_time`, `status`
- Constraints: valid session status, `end_time > start_time`

### `attendances`

- Purpose: attendance fact table between students and sessions
- Key columns: `student_id`, `session_id`, `confidence`, `status`, `marked_at`, `source`, `reviewed_by`
- Constraints: unique `student_id + session_id`, confidence between `0` and `1`

### `rechecks`

- Purpose: attendance dispute and review records
- Key columns: `student_id`, `session_id`, `requested_by`, `resolved_by`, `message`, `note`, `status`, `resolved_at`
- Constraints: valid recheck status

## Relationship map

- One `user` can teach many `subjects`
- One `classroom` can have many `students`
- Many `students` can enroll in many `subjects` through `student_subjects`
- One `subject` can have many `sessions`
- One `session` can have many `attendances`
- One `attendance situation` can lead to many `rechecks`

## Suggested SQL schema

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  phone VARCHAR(30),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'faculty', 'student'))
);

CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  code VARCHAR(50) UNIQUE,
  building VARCHAR(120),
  floor VARCHAR(30),
  capacity INTEGER,
  camera_url TEXT,
  device_status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_classrooms_capacity CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT chk_classrooms_device_status CHECK (device_status IN ('active', 'inactive', 'maintenance'))
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  roll_number VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  face_embedding_id VARCHAR(255),
  guardian_name VARCHAR(120),
  guardian_phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  code VARCHAR(50) UNIQUE,
  department VARCHAR(120),
  semester INTEGER,
  credits INTEGER,
  faculty_id UUID REFERENCES users(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_subjects_semester CHECK (semester IS NULL OR semester > 0),
  CONSTRAINT chk_subjects_credits CHECK (credits IS NULL OR credits >= 0)
);

CREATE TABLE student_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_subjects_student_subject UNIQUE (student_id, subject_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
  faculty_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  topic VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sessions_status CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  CONSTRAINT chk_sessions_end_after_start CHECK (end_time > start_time)
);

CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  confidence NUMERIC(4,3),
  status VARCHAR(20) NOT NULL DEFAULT 'present',
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NOT NULL DEFAULT 'recognition',
  evidence_image_url TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attendances_student_session UNIQUE (student_id, session_id),
  CONSTRAINT chk_attendances_status CHECK (status IN ('present', 'absent', 'late', 'excused')),
  CONSTRAINT chk_attendances_source CHECK (source IN ('manual', 'recognition', 'recheck')),
  CONSTRAINT chk_attendances_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE rechecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rechecks_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
```

## Notes

- This is a SQL design only; the current routes still use the in-memory store.
- If we wire up a real SQL database next, PostgreSQL plus an ORM like Prisma or Sequelize would fit this schema well.
