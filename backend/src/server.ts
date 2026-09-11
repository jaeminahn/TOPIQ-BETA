import { buildApp } from "./app.js";
import { visualWorker } from "./admin/workers/visual-worker.js";
import { config } from "./core/config.js";
import { pool } from "./core/db.js";
import { brevoQuotaWarningWorker } from "./email/quota-warning-worker.js";
import { ttsWorker } from "./listening/tts-worker.js";
import { mediaCleanupWorker } from "./media/cleanup-worker.js";
import { runMigrations } from "./migrate.js";

await runMigrations();
const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  ttsWorker.stop();
  visualWorker.stop();
  brevoQuotaWarningWorker.stop();
  mediaCleanupWorker.stop();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  ttsWorker.start();
  visualWorker.start();
  brevoQuotaWarningWorker.start();
  mediaCleanupWorker.start();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
