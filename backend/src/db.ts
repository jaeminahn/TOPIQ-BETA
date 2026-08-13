import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.nodeEnv === "production" ? 10 : 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  onConnect: async (client) => {
    await client.query("SET statement_timeout = '15s'");
    await client.query("SET idle_in_transaction_session_timeout = '15s'");
  },
});
