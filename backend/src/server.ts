import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { ttsWorker } from "./tts-worker.js";
import { visualWorker } from "./visual-worker.js";

await runMigrations();
const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  ttsWorker.stop();
  visualWorker.stop();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  ttsWorker.start();
  visualWorker.start();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
