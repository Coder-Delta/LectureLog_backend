import { defineSqlModel, withBaseRow } from "./base.model.js";

export const SESSION_STATUS = ["scheduled", "active", "completed", "cancelled"];

export const sessionModel = defineSqlModel({
  name: "Session",
  table: "sessions",
  columns: {
    subject_id: { type: "uuid", nullable: false },
    classroom_id: { type: "uuid", nullable: false },
    faculty_id: { type: "uuid", nullable: true },
    start_time: { type: "timestamptz", nullable: false },
    end_time: { type: "timestamptz", nullable: false },
    actual_start_time: { type: "timestamptz", nullable: true },
    actual_end_time: { type: "timestamptz", nullable: true },
    status: { type: "varchar(20)", nullable: false, default: "'scheduled'" },
    topic: { type: "varchar(255)", nullable: true },
    notes: { type: "text", nullable: true }
  },
  indexes: [
    { name: "idx_sessions_subject_start", columns: ["subject_id", "start_time"] },
    { name: "idx_sessions_classroom_start", columns: ["classroom_id", "start_time"] },
    { name: "idx_sessions_status_start", columns: ["status", "start_time"] }
  ],
  foreignKeys: [
    { columns: ["subject_id"], references: { table: "subjects", columns: ["id"] }, onDelete: "RESTRICT" },
    { columns: ["classroom_id"], references: { table: "classrooms", columns: ["id"] }, onDelete: "RESTRICT" },
    { columns: ["faculty_id"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" }
  ],
  checks: [
    {
      name: "chk_sessions_status",
      expression: `status IN (${SESSION_STATUS.map((status) => `'${status}'`).join(", ")})`
    },
    { name: "chk_sessions_end_after_start", expression: "end_time > start_time" }
  ]
});

export const createSession = ({
  subjectId,
  classroomId,
  facultyId = null,
  startTime,
  endTime,
  actualStartTime = null,
  actualEndTime = null,
  status = "scheduled",
  topic = null,
  notes = null
}) =>
  withBaseRow({
    subject_id: subjectId,
    classroom_id: classroomId,
    faculty_id: facultyId,
    start_time: startTime,
    end_time: endTime,
    actual_start_time: actualStartTime,
    actual_end_time: actualEndTime,
    status,
    topic,
    notes
  });

export default sessionModel;
