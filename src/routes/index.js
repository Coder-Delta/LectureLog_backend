import { Router } from "express";
import { store } from "../data/store.js";
import makeResourceRouter from "./resources.js";
import authRoutes from "./auth.routes.js";
import sessionsRoutes from "./sessions.routes.js";
import recognitionRoutes from "./recognition.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import recheckRoutes from "./recheck.routes.js";
import agentsRoutes from "./agents.routes.js";
import reportsRoutes from "./reports.routes.js";
import queryRoutes from "./query.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use(
  "/students",
  makeResourceRouter({
    label: "Student",
    collection: store.students,
    createFields: ["name", "email"]
  })
);
router.use(
  "/classrooms",
  makeResourceRouter({
    label: "Classroom",
    collection: store.classrooms,
    createFields: ["name", "camera_url"]
  })
);
router.use(
  "/subjects",
  makeResourceRouter({
    label: "Subject",
    collection: store.subjects,
    createFields: ["name"]
  })
);
router.use("/sessions", sessionsRoutes);
router.use("/recognition", recognitionRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/recheck", recheckRoutes);
router.use("/agents", agentsRoutes);
router.use("/reports", reportsRoutes);
router.use("/query", queryRoutes);

export default router;
