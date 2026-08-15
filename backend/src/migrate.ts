import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

// These checksums were recorded by the production database before migrations
// 002-004 were checked into this repository in their current form. Keep this
// allow-list narrow: all newer migrations still fail if an applied file changes.
const acceptedLegacyChecksums: Readonly<Record<string, readonly string[]>> = {
  "002_admin_listening.sql": ["f48dd01b46b3832f2521a7c5f2e8f90f02cb0462ce789f42ec7662e7f12a7098"],
  "003_admin_management.sql": ["d3f069112066fc387f81d90313c971c4c92e1645125953aa21e26314bf1b9306"],
  "004_admin_response_audio_groups.sql": ["7edb58d8435cfdc7505c78cd17256613efce2c4009c861b8c4fc0a5f7b5555e4"],
};

export function migrationChecksum(sql: string) {
  // Git stores migration files with LF, while Windows checkouts may use CRLF.
  // Line-ending differences do not change the SQL and must not invalidate an
  // already-applied migration.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function isAcceptedAppliedMigration(file: string, recorded: string | null | undefined, current: string) {
  if (!recorded || recorded === current) return true;
  return acceptedLegacyChecksums[file]?.includes(recorded.trim()) ?? false;
}

export async function runMigrations() {
  const migrationDir = resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('unigate_topik_app_migrations'))");
    lockAcquired = true;
    await client.query("CREATE SCHEMA IF NOT EXISTS topik_app");
    await client.query(`
      CREATE TABLE IF NOT EXISTS topik_app.schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of files) {
      const sql = await readFile(resolve(migrationDir, file), "utf8");
      const checksum = migrationChecksum(sql);
      const existing = await client.query<{ checksum: string | null }>(
        "SELECT checksum FROM topik_app.schema_migrations WHERE version = $1",
        [file],
      );
      if (existing.rowCount) {
        const recorded = existing.rows[0]?.checksum;
        if (!isAcceptedAppliedMigration(file, recorded, checksum)) {
          throw new Error(`Applied migration ${file} has changed`);
        }
        if (recorded && recorded.trim() !== checksum) {
          process.stderr.write(`Accepted known legacy checksum for ${file}\n`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO topik_app.schema_migrations(version, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        process.stdout.write(`Applied ${file}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext('unigate_topik_app_migrations'))");
    }
    client.release();
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runMigrations()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
