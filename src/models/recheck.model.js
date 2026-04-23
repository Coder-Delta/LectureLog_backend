import { defineSqlModel, withBaseRow } from "./base.model.js";

export const RECHECK_STATUS = ["pending", "approved", "rejected"];

export const recheckModel = defineSqlModel({
  name: "Recheck",
  table: "rechecks",
  columns: {
    student_id: { type: "uuid", nullable: false },
    session_id: { type: "uuid", nullable: false },
    requested_by: { type: "uuid", nullable: true },
    resolved_by: { type: "uuid", nullable: true },
    message: { type: "text", nullable: false },
    note: { type: "text", nullable: true },
    status: { type: "varchar(20)", nullable: false, default: "'pending'" },
    resolved_at: { type: "timestamptz", nullable: true }
  },
  indexes: [
    { name: "idx_rechecks_student_session_status", columns: ["student_id", "session_id", "status"] },
    { name: "idx_rechecks_status_created", columns: ["status", "created_at"] }
  ],
  foreignKeys: [
    { columns: ["student_id"], references: { table: "students", columns: ["id"] }, onDelete: "CASCADE" },
    { columns: ["session_id"], references: { table: "sessions", columns: ["id"] }, onDelete: "CASCADE" },
    { columns: ["requested_by"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" },
    { columns: ["resolved_by"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" }
  ],
  checks: [
    {
      name: "chk_rechecks_status",
      expression: `status IN (${RECHECK_STATUS.map((status) => `'${status}'`).join(", ")})`
    }
  ]
});

export const createRecheck = ({
  studentId,
  sessionId,
  requestedBy = null,
  resolvedBy = null,
  message,
  note = null,
  status = "pending",
  resolvedAt = null
}) =>
  withBaseRow({
    student_id: studentId,
    session_id: sessionId,
    requested_by: requestedBy,
    resolved_by: resolvedBy,
    message: String(message).trim(),
    note,
    status,
    resolved_at: resolvedAt
  });

export default recheckModel;
