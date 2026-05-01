import express from "express";
import {
  getSessionAttendance,
  markManualAttendance,
  getStudentAttendance
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
router.get(
  "/student/:id",
  authenticateToken,
  authorizeRole("teacher", "admin"),
  getStudentAttendance
);

export default router;
