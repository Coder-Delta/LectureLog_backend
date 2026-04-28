import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

// Route imports
import studentRoutes from "./routes/student.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import attendanceRoutes from "./routes/db-attendance.routes.js";
import recheckRoutes from "./routes/db-recheck.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import recognitionRoutes from "./routes/db-recognition.routes.js";
import authRoutes from "./routes/db-auth.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import { apiErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// Setup directory paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- GLOBAL MIDDLEWARE ---
app.use(cors()); // Allow cross-origin requests from frontend
app.use(helmet({ crossOriginResourcePolicy: false })); // Security headers (modified to allow image serving)
app.use(morgan("dev")); // HTTP request logger
app.use(express.json({ limit: "10mb" })); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// --- STATIC FILES ---
// Serve the 'public' folder to the internet so the frontend can load student images
app.use("/public", express.static(path.join(process.cwd(), "public")));

// --- HEALTH CHECK ---
app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Server is healthy" });
});

// --- API ROUTES ---
app.use("/api/students", studentRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/recheck", recheckRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/recognition", recognitionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/schedule", scheduleRoutes);

// --- ERROR HANDLING ---
// These must be at the very end to catch unresolved routes or crashes
app.use(notFoundHandler);
app.use(apiErrorHandler);

export default app;
