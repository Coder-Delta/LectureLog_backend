import mysql from "mysql2/promise";
import dotenv from "dotenv";
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

dotenv.config();

export const DATABASE_NAME = process.env.DB_NAME || "lecturelog";
export const DATABASE_PROVIDER = process.env.DB_PROVIDER || "mysql";
export const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.MYSQL_URL ||
  process.env.POSTGRES_URL ||
  `mysql://${process.env.DB_USER || "root"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "3306"}/${DATABASE_NAME}`;

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

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: DATABASE_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
