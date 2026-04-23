import { Router } from "express";
import { store } from "../data/store.js";
import tryCatch from "../utils/tryCatch.js";
import { ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/email/run",
  tryCatch(async (_req, res) =>
    ok(res, "Email agent executed", { sent: true, queuedRecipients: store.students.length })
  )
);

router.get(
  "/monitoring/flags",
  tryCatch(async (_req, res) => {
    const attendanceCountByStudent = new Map();
    for (const record of store.attendances) {
      attendanceCountByStudent.set(
        record.studentId,
        (attendanceCountByStudent.get(record.studentId) || 0) + 1
      );
    }

    const totalSessions = store.sessions.length || 1;
    const flags = store.students
      .map((student) => {
        const attended = attendanceCountByStudent.get(student.id) || 0;
        const attendanceRate = Number(((attended / totalSessions) * 100).toFixed(2));
        return { studentId: student.id, attendanceRate, risk: attendanceRate < 75 };
      })
      .filter((item) => item.risk);

    return ok(res, "Monitoring flags fetched", flags);
  })
);

export default router;
