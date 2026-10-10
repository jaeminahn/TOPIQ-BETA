import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assetSchema, compressExistingImages, optimizedPrefix, preparedSchema, rollbackImages,
  type BackfillIO, type ImageAsset, type PreparedImage,
} from "./listening-image-backfill.js";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `기존 듣기 그림 선택지를 최대 440x330, WebP 품질 85로 압축합니다.
기본은 미리보기이며, 원본 파일은 어떤 모드에서도 삭제하지 않습니다.

프로젝트 루트에서 운영 환경 실행 (backend/.env.production 사용):
  pnpm --filter @unigate/topik-api images:compress:production --dry-run --limit 10
  pnpm --filter @unigate/topik-api images:compress:production --apply --limit 10
  pnpm --filter @unigate/topik-api images:compress:production --apply
  pnpm --filter @unigate/topik-api images:compress:production --rollback <적용-기록.jsonl>

옵션:
  --dry-run          다운로드·압축·절감량 계산만 수행 (기본값)
  --apply            새 파일 업로드 및 DB 연결 변경
  --rollback <file>  적용 기록으로 DB 연결 복구 (즉시 실행, --apply와 함께 사용하지 않음)
  --limit <number>   미리보기/적용할 후보 개수 제한
  --report <file>    실행 기록 저장 경로 (기존 파일 덮어쓰기 금지)
  --env-file <file>  해당 환경 파일만 로드 (기존 프로세스 환경변수 우선)
  --help             도움말

상대 경로는 모두 backend/ 기준입니다.
운영 명령 images:compress:production은 backend/.env.production만 읽습니다.
일반 명령 images:compress의 기본값: backend/.env.<NODE_ENV 또는 development>, 이어서 backend/.env.
필수: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
선택: DATABASE_SSL=require
기록 기본 위치: backend/.image-compression-backups/ (복구를 위해 보관)
종료 코드: 0=완료, 1=실패 또는 일부 항목 실패.
`;

export function parseArguments(argv: string[]) {
  const { values } = parseArgs({ args: argv.filter((arg) => arg !== "--"), options: {
    "dry-run": { type: "boolean" }, apply: { type: "boolean" }, rollback: { type: "string" },
    limit: { type: "string" }, report: { type: "string" }, "env-file": { type: "string" },
    help: { type: "boolean", short: "h" },
  } });
  if ([values["dry-run"], values.apply, values.rollback !== undefined].filter(Boolean).length > 1)
    throw new Error("--dry-run, --apply, --rollback 중 하나만 지정하세요.");
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!/^\d+$/.test(values.limit!) || !Number.isSafeInteger(limit) || limit < 1))
    throw new Error("--limit은 양의 정수여야 합니다.");
  if (values.rollback !== undefined && (!values.rollback.trim() || limit !== undefined))
    throw new Error("--rollback에는 기록 파일이 필요하며 --limit과 함께 사용할 수 없습니다.");
  return { apply: values.apply ?? false, rollback: values.rollback, limit, report: values.report,
    envFile: values["env-file"], help: values.help ?? false };
}

export function targetFingerprint(databaseUrl: string, storageUrl: string) {
  const db = new URL(databaseUrl);
  return createHash("sha256").update(JSON.stringify([
    db.hostname, db.port || "5432", db.pathname, db.username, new URL(storageUrl).origin,
  ])).digest("hex");
}

export function readRollbackReport(text: string, target: string): PreparedImage[] {
  // A killed process may leave an incomplete final line; previous fsynced records remain usable.
  const lines = text.split("\n");
  if (lines.at(-1) !== "") {
    console.warn("기록의 마지막 미완료 줄을 제외하고 복구합니다.");
  }
  lines.pop();
  const records = lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as Record<string, unknown>);
  const header = z.object({ type: z.literal("header"), version: z.literal(1),
    mode: z.literal("apply"), target: z.literal(target) }).safeParse(records[0]);
  if (!header.success) throw new Error("현재 DB/스토리지 대상과 일치하는 적용 기록이 아닙니다.");
  return records.filter((record) => record.type === "prepared").map((record) => preparedSchema.parse(record));
}

const columns = `a.visual_asset_id AS id, a.storage_bucket AS bucket, a.storage_path AS path,
  a.storage_url AS url, a.mime_type AS "mimeType", a.byte_size AS "byteSize"`;

export const candidateQuery = `SELECT ${columns} FROM topik_app.item_visual_assets a
  JOIN topik_bank.item_versions iv ON iv.item_id=a.item_id AND iv.item_version=a.item_version
  WHERE a.is_current AND a.visual_role='choice' AND iv.section='listening'
    AND a.mime_type IN ('image/png','image/jpeg','image/webp')
    AND a.storage_path NOT LIKE $1
  ORDER BY a.visual_asset_id LIMIT $2`;

export const replaceQuery = `UPDATE topik_app.item_visual_assets a
  SET storage_bucket=$8, storage_path=$9, storage_url=$10, mime_type=$11, byte_size=$12
  WHERE a.visual_asset_id=$1 AND a.storage_bucket=$2 AND a.storage_path=$3
    AND a.storage_url=$4 AND a.mime_type=$5 AND a.byte_size=$6 AND a.is_current=$7
    AND a.visual_role='choice' AND EXISTS (
      SELECT 1 FROM topik_bank.item_versions iv WHERE iv.item_id=a.item_id
        AND iv.item_version=a.item_version AND iv.section='listening')
  RETURNING a.visual_asset_id`;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(help); return; }
  if (options.envFile) {
    const result = loadEnv({ path: resolve(backendRoot, options.envFile), quiet: true });
    if (result.error) throw new Error("--env-file 환경 파일을 읽을 수 없습니다.");
  } else {
    loadEnv({ path: resolve(backendRoot, `.env.${process.env.NODE_ENV ?? "development"}`), quiet: true });
    loadEnv({ path: resolve(backendRoot, ".env"), quiet: true });
  }
  const env = z.object({ DATABASE_URL: z.string().url(), SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), DATABASE_SSL: z.enum(["require", "disable"]).default("disable"),
  }).safeParse(process.env);
  if (!env.success) throw new Error("DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_SSL 설정을 확인하세요.");
  const settings = env.data;
  const target = targetFingerprint(settings.DATABASE_URL, settings.SUPABASE_URL);
  const rollbackEntries = options.rollback
    ? readRollbackReport(await readFile(resolve(backendRoot, options.rollback), "utf8"), target) : null;
  const mode = rollbackEntries ? "rollback" : options.apply ? "apply" : "dry-run";
  const reportPath = resolve(backendRoot, options.report ??
    `.image-compression-backups/${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}-${randomUUID()}.jsonl`);
  await mkdir(dirname(reportPath), { recursive: true });
  const report = await open(reportPath, "wx", 0o600);
  const pool = new pg.Pool({ connectionString: settings.DATABASE_URL, max: 1,
    connectionTimeoutMillis: 10_000, statement_timeout: 15_000,
    ssl: settings.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  const storage = createClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }) },
  }).storage;
  const journal = async (event: Record<string, unknown>) => {
    await report.writeFile(JSON.stringify({ ...event, time: new Date().toISOString() }) + "\n");
    await report.sync();
    if (event.type !== "prepared") console.log(JSON.stringify(event));
  };
  const io: BackfillIO = {
    download: async (bucket, path) => {
      const result = await storage.from(bucket).download(path);
      if (result.error) throw new Error("Storage download failed");
      return Buffer.from(await result.data.arrayBuffer());
    },
    upload: async (bucket, path, data) => {
      const result = await storage.from(bucket).upload(path, data, {
        contentType: "image/webp", cacheControl: "31536000", upsert: false,
      });
      if (result.error) throw new Error("Storage upload failed");
    },
    publicUrl: (bucket, path) => storage.from(bucket).getPublicUrl(path).data.publicUrl,
    replace: async (before, after) => {
      const result = await pool.query(replaceQuery, [
        before.id, before.bucket, before.path, before.url, before.mimeType, before.byteSize, true,
        after.bucket, after.path, after.url, after.mimeType, after.byteSize,
      ]);
      return result.rowCount === 1;
    },
    current: async (id) => {
      const result = await pool.query<ImageAsset>(`SELECT ${columns} FROM topik_app.item_visual_assets a
        WHERE a.visual_asset_id=$1 AND a.is_current AND a.visual_role='choice'`, [id]);
      return result.rows[0] ? assetSchema.parse(result.rows[0]) : null;
    },
  };
  try {
    console.log(`모드: ${mode} | DB: ${new URL(settings.DATABASE_URL).hostname} | Storage: ${new URL(settings.SUPABASE_URL).origin}`);
    console.log(`실행 기록: ${reportPath}`);
    await journal({ type: "header", version: 1, mode, target });
    const totals = rollbackEntries ? await rollbackImages(rollbackEntries, io, journal)
      : await compressExistingImages(
        (await pool.query<ImageAsset>(candidateQuery, [`${optimizedPrefix}%`, options.limit ?? null])).rows.map((row) => assetSchema.parse(row)),
        options.apply, io, journal,
      );
    await journal({ type: "summary", ...totals });
    if (totals.failed) process.exitCode = 1;
  } finally {
    await pool.end();
    await report.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    let message = error instanceof Error ? error.message : "알 수 없는 오류";
    for (const key of ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const secret = process.env[key];
      if (secret) message = message.replaceAll(secret, "[redacted]");
    }
    console.error(`실행 실패: ${message}. 원본 파일은 삭제하지 않습니다. --help로 사용법을 확인하세요.`);
    process.exitCode = 1;
  });
}
