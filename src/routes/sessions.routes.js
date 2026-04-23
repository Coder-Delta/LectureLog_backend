import { Router } from "express";
import { store, updateTimestamp, createEntity } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { created, ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/start",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["subjectId", "classroomId", "startTime", "endTime"]);

      const subject = store.subjects.find((x) => x.id === req.body.subjectId);
      const classroom = store.classrooms.find((x) => x.id === req.body.classroomId);
      if (!subject || !classroom) {
        throw new ApiError(400, "Invalid subjectId or classroomId");
      }

      const session = createEntity({
        subjectId: req.body.subjectId,
        classroomId: req.body.classroomId,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        actualEndTime: null,
        status: "active"
      });
      store.sessions.push(session);
      return created(res, "Session started", session);
    })
);

router.post(
  "/end",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["sessionId"]);
      const index = store.sessions.findIndex((x) => x.id === req.body.sessionId);
      if (index === -1) {
        throw new ApiError(404, "Session not found");
      }
      store.sessions[index] = updateTimestamp({
        ...store.sessions[index],
        status: "completed",
        actualEndTime: new Date().toISOString()
      });
      return ok(res, "Session ended", store.sessions[index]);
    })
);

router.get(
  "/",
  tryCatch(async (_req, res) => ok(res, "Sessions fetched", store.sessions))
);

router.get(
  "/active",
  tryCatch(async (_req, res) =>
    ok(res, "Active sessions fetched", store.sessions.filter((item) => item.status === "active"))
  )
);

router.get(
  "/:id",
  tryCatch(async (req, res) => {
      const session = store.sessions.find((item) => item.id === req.params.id);
      if (!session) {
        throw new ApiError(404, "Session not found");
      }
      return ok(res, "Session details fetched", session);
    })
);

export default router;
