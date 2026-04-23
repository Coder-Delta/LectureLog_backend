import { Router } from "express";
import { store } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { ok } from "../utils/respond.js";

const router = Router();

const makeReport = (scope) => ({
  scope,
  generatedAt: new Date().toISOString(),
  totals: {
    students: store.students.length,
    subjects: store.subjects.length,
    sessions: store.sessions.length,
    attendanceRecords: store.attendances.length
  }
});

router.get("/weekly", tryCatch(async (_req, res) => ok(res, "Weekly report fetched", makeReport("weekly"))));
router.get("/monthly", tryCatch(async (_req, res) => ok(res, "Monthly report fetched", makeReport("monthly"))));

router.get(
  "/session/:sessionId",
  tryCatch(async (req, res) => {
    const session = store.sessions.find((item) => item.id === req.params.sessionId);
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    const attendance = store.attendances.filter((item) => item.sessionId === req.params.sessionId);
    return ok(res, "Session report fetched", { session, attendance, totalAttendance: attendance.length });
  })
);

export default router;
