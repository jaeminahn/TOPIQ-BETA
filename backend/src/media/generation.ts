import type { PoolClient } from "pg";
import { pool } from "../core/db.js";
import { config } from "../core/config.js";
import { AppError } from "../core/errors.js";

// Session locks require a direct database connection or a session pooler.
// Keep the lease connection outside transactions during external API calls.
export async function withGeneration<T>(kind: "tts" | "visual", operation: (signal: AbortSignal, client: PoolClient) => Promise<T>) {
  if (new URL(config.databaseUrl).port === "6543") {
    throw new AppError(503, "GENERATION_DATABASE_MODE", "Generation requires a direct connection or session pooler");
  }
  const client = await pool.connect();
  let locked = false;
  let discard = false;
  const controller = new AbortController();
  const connectionError = (error: Error) => { discard = true; controller.abort(error); };
  client.on("error", connectionError);
  const timer = setTimeout(() => controller.abort(new AppError(504, "GENERATION_TIMEOUT", "Generation timed out. Refresh the item before retrying.")), config.mediaGenerationTimeoutMs);
  timer.unref();
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`media-generation:${kind}`]);
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new AppError(409, "GENERATION_BUSY", "Another generation request is running. Try again after it finishes.");
    controller.signal.throwIfAborted();
    return await operation(controller.signal, client);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    if (locked && !discard) {
      try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`media-generation:${kind}`]); }
      catch { discard = true; }
    }
    client.removeListener("error", connectionError);
    client.release(discard);
  }
}
