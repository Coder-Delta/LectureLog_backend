import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import studentRoutes from "./routes/student.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import attendanceRoutes from "./routes/db-attendance.routes.js";
import recheckRoutes from "./routes/db-recheck.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import recognitionRoutes from "./routes/db-recognition.routes.js";
import authRoutes from "./routes/db-auth.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import { apiErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Server is healthy" });
});

app.use("/api/students", studentRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/recheck", recheckRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/recognition", recognitionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/schedule", scheduleRoutes);

app.use(notFoundHandler);
app.use(apiErrorHandler);

export default app;
