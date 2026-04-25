import express from "express";
import {
  getSessionAttendance,
  markManualAttendance
} from "../controllers/attendance.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/session/:id",
  authenticateToken,
  authorizeRole("teacher", "admin"),
  getSessionAttendance
);
router.post(
  "/manual",
  authenticateToken,
  authorizeRole("teacher", "admin"),
  markManualAttendance
);

export default router;
