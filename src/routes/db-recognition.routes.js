import express from "express";
import { processRecognition, getSessionAttendance } from "../controllers/recognition.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/",
  processRecognition
);

router.get(
  "/:sessionId",
  authenticateToken,
  getSessionAttendance
);

export default router;
