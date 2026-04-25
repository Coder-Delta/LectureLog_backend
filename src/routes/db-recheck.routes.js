import express from "express";
import {
  createRecheckRequest,
  getRecheckRequests,
  updateRecheckStatus
} from "../controllers/recheck.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", authenticateToken, createRecheckRequest);
router.get("/", authenticateToken, authorizeRole("teacher", "admin"), getRecheckRequests);
router.patch(
  "/status",
  authenticateToken,
  authorizeRole("teacher", "admin"),
  updateRecheckStatus
);

export default router;
