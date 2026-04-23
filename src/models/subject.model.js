import { defineSqlModel, withBaseRow } from "./base.model.js";

export const subjectModel = defineSqlModel({
  name: "Subject",
  table: "subjects",
  columns: {
    name: { type: "varchar(120)", nullable: false },
    code: { type: "varchar(50)", nullable: true, unique: true },
    department: { type: "varchar(120)", nullable: true },
    semester: { type: "integer", nullable: true },
    credits: { type: "integer", nullable: true },
    faculty_id: { type: "uuid", nullable: true },
    classroom_id: { type: "uuid", nullable: true }
  },
  indexes: [
    { name: "idx_subjects_name", columns: ["name"] },
    { name: "idx_subjects_faculty_semester", columns: ["faculty_id", "semester"] }
  ],
  foreignKeys: [
    { columns: ["faculty_id"], references: { table: "users", columns: ["id"] }, onDelete: "SET NULL" },
    { columns: ["classroom_id"], references: { table: "classrooms", columns: ["id"] }, onDelete: "SET NULL" }
  ],
  checks: [
    { name: "chk_subjects_semester", expression: "semester IS NULL OR semester > 0" },
    { name: "chk_subjects_credits", expression: "credits IS NULL OR credits >= 0" }
  ]
});

export const createSubject = ({
  name,
  code = null,
  department = null,
  semester = null,
  credits = null,
  facultyId = null,
  classroomId = null
}) =>
  withBaseRow({
    name: String(name).trim(),
    code,
    department,
    semester,
    credits,
    faculty_id: facultyId,
    classroom_id: classroomId
  });

export default subjectModel;
