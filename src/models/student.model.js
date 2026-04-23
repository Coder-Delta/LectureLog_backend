import { defineSqlModel, normalizeEmail, withBaseRow } from "./base.model.js";

export const studentModel = defineSqlModel({
  name: "Student",
  table: "students",
  columns: {
    user_id: { type: "uuid", nullable: true },
    roll_number: { type: "varchar(50)", nullable: false, unique: true },
    name: { type: "varchar(120)", nullable: false },
    email: { type: "varchar(255)", nullable: false, unique: true },
    classroom_id: { type: "uuid", nullable: true },
    face_embedding_id: { type: "varchar(255)", nullable: true },
    guardian_name: { type: "varchar(120)", nullable: true },
    guardian_phone: { type: "varchar(30)", nullable: true },
    is_active: { type: "boolean", nullable: false, default: "true" }
  },
  indexes: [
    { name: "idx_students_classroom_active", columns: ["classroom_id", "is_active"] }
  ],
  foreignKeys: [
    { columns: ["user_id"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" },
    { columns: ["classroom_id"], references: { table: "classrooms", columns: ["id"] }, onDelete: "SET NULL" }
  ]
});

export const createStudent = ({
  userId = null,
  rollNumber,
  name,
  email,
  classroomId = null,
  faceEmbeddingId = null,
  guardianName = null,
  guardianPhone = null,
  isActive = true
}) =>
  withBaseRow({
    user_id: userId,
    roll_number: String(rollNumber).trim(),
    name: String(name).trim(),
    email: normalizeEmail(email),
    classroom_id: classroomId,
    face_embedding_id: faceEmbeddingId,
    guardian_name: guardianName,
    guardian_phone: guardianPhone,
    is_active: isActive
  });

export default studentModel;
