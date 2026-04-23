import { defineSqlModel, withBaseRow } from "./base.model.js";

export const ATTENDANCE_STATUS = ["present", "absent", "late", "excused"];
export const ATTENDANCE_SOURCE = ["manual", "recognition", "recheck"];

export const attendanceModel = defineSqlModel({
  name: "Attendance",
  table: "attendances",
  columns: {
    student_id: { type: "uuid", nullable: false },
    session_id: { type: "uuid", nullable: false },
    confidence: { type: "numeric(4,3)", nullable: true },
    status: { type: "varchar(20)", nullable: false, default: "'present'" },
    marked_at: { type: "timestamptz", nullable: false, default: "now()" },
    source: { type: "varchar(20)", nullable: false, default: "'recognition'" },
    evidence_image_url: { type: "text", nullable: true },
    reviewed_by: { type: "uuid", nullable: true }
  },
  indexes: [
    { name: "uq_attendances_student_session", columns: ["student_id", "session_id"], unique: true },
    { name: "idx_attendances_session_status", columns: ["session_id", "status"] },
    { name: "idx_attendances_student_marked", columns: ["student_id", "marked_at"] }
  ],
  foreignKeys: [
    { columns: ["student_id"], references: { table: "students", columns: ["id"] }, onDelete: "CASCADE" },
    { columns: ["session_id"], references: { table: "sessions", columns: ["id"] }, onDelete: "CASCADE" },
    { columns: ["reviewed_by"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" }
  ],
  checks: [
    {
      name: "chk_attendances_status",
      expression: `status IN (${ATTENDANCE_STATUS.map((status) => `'${status}'`).join(", ")})`
    },
    {
      name: "chk_attendances_source",
      expression: `source IN (${ATTENDANCE_SOURCE.map((source) => `'${source}'`).join(", ")})`
    },
    { name: "chk_attendances_confidence", expression: "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)" }
  ]
});

export const createAttendance = ({
  studentId,
  sessionId,
  confidence = null,
  status = "present",
  markedAt = new Date().toISOString(),
  source = "recognition",
  evidenceImageUrl = null,
  reviewedBy = null
}) =>
  withBaseRow({
    student_id: studentId,
    session_id: sessionId,
    confidence,
    status,
    marked_at: markedAt,
    source,
    evidence_image_url: evidenceImageUrl,
    reviewed_by: reviewedBy
  });

export default attendanceModel;
