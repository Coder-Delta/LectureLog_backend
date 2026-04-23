import { randomUUID } from "node:crypto";
import { Router } from "express";
import { store } from "../data/store.js";
import ApiError from "../utils/apiError.js";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { ok } from "../utils/respond.js";

const router = Router();

router.post(
  "/login",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["email"]);
      const user = store.users.find((item) => item.email === req.body.email);
      if (!user) {
        throw new ApiError(401, "Invalid credentials");
      }
      const token = randomUUID();
      store.authTokens.set(token, user.id);
      return ok(res, "Logged in", { token, user });
    })
);

router.post(
  "/logout",
  tryCatch(async (req, res) => {
      assertRequired(req.body, ["token"]);
      store.authTokens.delete(req.body.token);
      return ok(res, "Logged out");
    })
);

router.get(
  "/me",
  tryCatch(async (req, res) => {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        throw new ApiError(401, "Authorization token required");
      }
      const userId = store.authTokens.get(token);
      const user = store.users.find((item) => item.id === userId);
      if (!user) {
        throw new ApiError(401, "Invalid or expired token");
      }
      return ok(res, "Current user fetched", user);
    })
);

export default router;
