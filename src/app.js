import express from "express";
import { apiErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Server is healthy" });
});

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(apiErrorHandler);

export default app;
