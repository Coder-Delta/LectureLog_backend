import { defineSqlModel, withBaseRow } from "./base.model.js";

export const studentSubjectModel = defineSqlModel({
  name: "StudentSubject",
  table: "student_subjects",
  columns: {
    student_id: { type: "uuid", nullable: false },
    subject_id: { type: "uuid", nullable: false }
  },
  indexes: [
    { name: "uq_student_subjects_student_subject", columns: ["student_id", "subject_id"], unique: true },
    { name: "idx_student_subjects_subject", columns: ["subject_id"] }
  ],
  foreignKeys: [
    { columns: ["student_id"], references: { table: "students", columns: ["id"] }, onDelete: "CASCADE" },
    { columns: ["subject_id"], references: { table: "subjects", columns: ["id"] }, onDelete: "CASCADE" }
  ]
});

export const createStudentSubject = ({ studentId, subjectId }) =>
  withBaseRow({
    student_id: studentId,
    subject_id: subjectId
  });

export default studentSubjectModel;
