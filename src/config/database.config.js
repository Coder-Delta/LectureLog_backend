import {
  attendanceModel,
  classroomModel,
  recheckModel,
  sessionModel,
  studentModel,
  studentSubjectModel,
  subjectModel,
  userModel
} from "../models/index.js";

export const DATABASE_NAME = process.env.DB_NAME || "lecturelog";
export const DATABASE_PROVIDER = process.env.DB_PROVIDER || "postgresql";
export const DATABASE_URL =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || `postgresql://postgres:postgres@127.0.0.1:5432/${DATABASE_NAME}`;

export const databaseDesign = {
  provider: DATABASE_PROVIDER,
  databaseName: DATABASE_NAME,
  tables: [
    userModel,
    studentModel,
    studentSubjectModel,
    classroomModel,
    subjectModel,
    sessionModel,
    attendanceModel,
    recheckModel
  ],
  relationships: [
    "users 1:n subjects through subjects.faculty_id",
    "classrooms 1:n students through students.classroom_id",
    "students n:n subjects through student_subjects",
    "subjects 1:n sessions through sessions.subject_id",
    "classrooms 1:n sessions through sessions.classroom_id",
    "students n:n sessions through attendances",
    "sessions 1:n rechecks through rechecks.session_id"
  ],
  authStrategy: {
    recommended: "JWT or a dedicated auth_sessions SQL table",
    note: "The current in-memory authTokens map should not be used as production persistence."
  }
};

export default databaseDesign;
