import { Router } from "express";
import { store } from "../data/store.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/",
  tryCatch(async (req, res) => {
    assertRequired(req.body, ["question"]);
    const question = String(req.body.question).toLowerCase();

    if (question.includes("missed")) {
      const byStudent = new Map();
      for (const student of store.students) {
        byStudent.set(student.id, { ...student, attended: 0 });
      }
      for (const attendance of store.attendances) {
        const item = byStudent.get(attendance.studentId);
        if (item) {
          item.attended += 1;
        }
      }
      const totalSessions = store.sessions.length;
      const missed = [...byStudent.values()].map((student) => ({
        studentId: student.id,
        name: student.name,
        missed: Math.max(totalSessions - student.attended, 0)
      }));
      return ok(res, "Query answered", { answer: "Students with missed classes computed", data: missed });
    }

    return ok(res, "Query answered", {
      answer: "I can answer attendance and basic session trend questions in this database-free mode.",
      data: null
    });
  })
);

export default router;
