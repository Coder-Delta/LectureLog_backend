import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { testDatabaseConnection } from "./config/database.config.js";
import { initScheduler } from "./services/scheduler.service.js";

dotenv.config();

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.set("io", io);

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    await testDatabaseConnection();
    console.log("Connected to PostgreSQL database.");

    initScheduler(app);

    server.listen(PORT, () => {
      console.log(`LectureLog backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error);
    process.exit(1);
  }
};

startServer();
