import { Router } from "express";
import { store, createEntity } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { created, ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["studentId", "sessionId", "confidence"]);

      const student = store.students.find((item) => item.id === req.body.studentId);
      const session = store.sessions.find((item) => item.id === req.body.sessionId);
      if (!student || !session) {
        throw new ApiError(400, "Invalid studentId or sessionId");
      }

      const existing = store.attendances.find(
        (item) => item.studentId === req.body.studentId && item.sessionId === req.body.sessionId
      );
      if (existing) {
        existing.confidence = req.body.confidence;
        existing.status = "present";
        existing.updatedAt = new Date().toISOString();
        return ok(res, "Attendance updated", existing);
      }

      const attendance = createEntity({
        studentId: req.body.studentId,
        sessionId: req.body.sessionId,
        confidence: req.body.confidence,
        status: "present"
      });
      store.attendances.push(attendance);
      return created(res, "Attendance marked", attendance);
    })
);

router.get(
  "/session/:sessionId",
  tryCatch(async (req, res) =>
    ok(res, "Session attendance fetched", store.attendances.filter((item) => item.sessionId === req.params.sessionId))
  )
);

router.get(
  "/student/:studentId",
  tryCatch(async (req, res) =>
    ok(res, "Student attendance fetched", store.attendances.filter((item) => item.studentId === req.params.studentId))
  )
);

router.get(
  "/summary",
  tryCatch(async (req, res) => {
      const { sessionId } = req.query;
      const data = sessionId
        ? store.attendances.filter((item) => item.sessionId === sessionId)
        : store.attendances;

      const summary = {
        total: data.length,
        present: data.filter((item) => item.status === "present").length,
        avgConfidence:
          data.length === 0
            ? 0
            : Number((data.reduce((acc, item) => acc + Number(item.confidence), 0) / data.length).toFixed(2))
      };

      return ok(res, "Attendance summary fetched", summary);
    })
);

export default router;
