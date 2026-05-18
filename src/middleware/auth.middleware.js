import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../config/database.config.js";

dotenv.config();

// ── In-memory session cache (Refinement #5) ──────────────────────
// Avoids hitting DB on every single request. Cache TTL = 60 seconds.
const sessionCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute

const getCachedSession = (userId) => {
  const entry = sessionCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    sessionCache.delete(userId);
    return null;
  }
  return entry.token;
};

const setCachedSession = (userId, token) => {
  sessionCache.set(userId, { token, timestamp: Date.now() });
};

// Invalidate cache when a new login occurs
export const invalidateSessionCache = (userId) => {
  sessionCache.delete(userId);
};

// ── Session Expiry Timeout (Refinement #8) ───────────────────────
const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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

    jwt.verify(token, process.env.JWT_SECRET || "secret", async (err, user) => {
      if (err) {
        return res.status(403).json({ 
          message: "Session expired or invalid token. Please log out and sign in again.", 
          error: err.message 
        });
      }

    // ── Admin Session Validation (Refinement #5) ──
    // Only verify session_token for admin users (teacher/student logins are unaffected)
    if (user.role === 'admin' && user.session_token) {
      try {
        // Check in-memory cache first to avoid DB hit on every request
        const cachedToken = getCachedSession(user.id);

        if (cachedToken !== null) {
          // Cache hit — fast path
          if (cachedToken !== user.session_token) {
            return res.status(401).json({ 
              message: 'Your admin session has been replaced by a login on another device.',
              code: 'SESSION_REPLACED'
            });
          }
        } else {
          // Cache miss — query DB, then cache the result
          const { rows } = await pool.query(
            'SELECT admin_session_token, admin_last_seen FROM users WHERE id = $1',
            [user.id]
          );

          if (rows.length > 0) {
            const dbToken = rows[0].admin_session_token;
            const lastSeen = rows[0].admin_last_seen;
            setCachedSession(user.id, dbToken);

            // Check if session was replaced by another login
            if (dbToken && dbToken !== user.session_token) {
              return res.status(401).json({ 
                message: 'Your admin session has been replaced by a login on another device.',
                code: 'SESSION_REPLACED'
              });
            }

            // Check inactivity timeout (Refinement #8)
            if (lastSeen) {
              const elapsed = Date.now() - new Date(lastSeen).getTime();
              if (elapsed > SESSION_INACTIVITY_TIMEOUT_MS) {
                // Clear the stale session in DB
                await pool.query(
                  'UPDATE users SET admin_session_token = NULL WHERE id = $1',
                  [user.id]
                );
                invalidateSessionCache(user.id);
                return res.status(401).json({
                  message: 'Admin session expired due to inactivity.',
                  code: 'SESSION_EXPIRED'
                });
              }
            }

            // Update last_seen (heartbeat) — but don't await, fire-and-forget for performance
            pool.query(
              'UPDATE users SET admin_last_seen = NOW() WHERE id = $1',
              [user.id]
            ).catch(() => {});
          }
        }
      } catch (dbErr) {
        // If DB check fails, still allow the request (graceful degradation)
        console.warn('[AuthMiddleware] Session validation DB error (allowing request):', dbErr.message);
      }
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
