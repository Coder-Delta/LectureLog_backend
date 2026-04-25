import express from "express";
import { processRecognition } from "../controllers/recognition.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRole("teacher", "admin"),
  processRecognition
);

export default router;
