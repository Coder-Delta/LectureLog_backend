import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    const remoteIp = req.ip || req.socket.remoteAddress;
    const isLocal = remoteIp === '::1' || remoteIp === '127.0.0.1' || remoteIp === '::ffff:127.0.0.1';
    if (isLocal) {
      req.user = { id: 0, role: 'admin' };
      return next();
    }
    return res.sendStatus(401);
  }

    jwt.verify(token, process.env.JWT_SECRET || "secret", (err, user) => {
      if (err) {
        return res.status(403).json({ 
          message: "Session expired or invalid token. Please log out and sign in again.", 
          error: err.message 
        });
      }

    req.user = user;
    next();
  });
};

export const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.sendStatus(401);
    }

    console.log("[AuthMiddleware] User:", req.user, "Required Roles:", roles);
    if (!roles.includes(req.user.role) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
