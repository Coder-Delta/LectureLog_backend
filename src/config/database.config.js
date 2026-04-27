import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

export const DATABASE_NAME = process.env.DB_NAME || "lecturelog";
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
  } finally {
    client.release();
  }
};

export default pool;
