import { Router } from "express";
import { store } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["image", "sessionId"]);

      const session = store.sessions.find((item) => item.id === req.body.sessionId);
      if (!session) {
        throw new ApiError(404, "Session not found");
      }
      if (store.students.length === 0) {
        throw new ApiError(400, "No students available for recognition");
      }

      const hash = String(req.body.image).length;
      const student = store.students[hash % store.students.length];
      const confidence = Number((0.7 + ((hash % 30) / 100)).toFixed(2));

      return ok(res, "Recognition completed", {
        studentId: student.id,
        confidence
      });
    })
);

export default router;
