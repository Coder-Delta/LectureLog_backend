import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { initScheduler } from "./services/scheduler.service.js";

dotenv.config();

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.set("io", io);

initScheduler(app);

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`LectureLog backend running on port ${PORT}`);
});
