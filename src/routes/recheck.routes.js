import { Router } from "express";
import { store, createEntity, updateTimestamp } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { created, ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/",
  tryCatch(async (req, res) => {
    assertRequired(req.body, ["studentId", "sessionId", "message"]);
    const recheck = createEntity({
      studentId: req.body.studentId,
      sessionId: req.body.sessionId,
      message: req.body.message,
      status: "pending",
      note: null
    });
    store.rechecks.push(recheck);
    return created(res, "Recheck request created", recheck);
  })
);

router.get(
  "/",
  tryCatch(async (_req, res) => ok(res, "Recheck requests fetched", store.rechecks))
);

router.post(
  "/:id/resolve",
  tryCatch(async (req, res) => {
    assertRequired(req.body, ["status"]);
    if (!["approved", "rejected"].includes(req.body.status)) {
      throw new ApiError(400, "Status must be approved or rejected");
    }

    const index = store.rechecks.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      throw new ApiError(404, "Recheck request not found");
    }

    store.rechecks[index] = updateTimestamp({
      ...store.rechecks[index],
      status: req.body.status,
      note: req.body.note ?? null
    });

    return ok(res, "Recheck request resolved", store.rechecks[index]);
  })
);

export default router;
