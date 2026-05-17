import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

export const DATABASE_NAME = process.env.DB_NAME || "Merge";
export const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;

const parseSslSetting = () => {
  const raw = process.env.DB_SSL;
  if (!raw) {
    return false;
  }

  return ["1", "true", "yes"].includes(raw.toLowerCase())
    ? { rejectUnauthorized: false }
    : false;
};

const poolConfig = DATABASE_URL
  ? {
    connectionString: DATABASE_URL,
    ssl: parseSslSetting()
  }
  : {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: DATABASE_NAME,
    port: Number(process.env.DB_PORT) || 5432,
    ssl: parseSslSetting(),
    max: 10,
    idleTimeoutMillis: 30000
  };

const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  console.error("[Database Pool Error]", error);
});

export const testDatabaseConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    // Ensure notifications table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        receiver_id INTEGER NOT NULL,
        receiver_role VARCHAR(50) NOT NULL,
        sender_id INTEGER,
        sender_name VARCHAR(255),
        sender_image TEXT,
        type VARCHAR(50) NOT NULL,
        session_type VARCHAR(30),
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        redirect_url VARCHAR(255),
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(receiver_id, receiver_role, is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_expiry ON notifications(expires_at) WHERE expires_at IS NOT NULL;
    `);
  } finally {
    client.release();
  }
};

export default pool;
