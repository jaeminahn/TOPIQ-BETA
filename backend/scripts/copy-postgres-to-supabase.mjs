#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseEnv } from "dotenv";

const scriptPath = fileURLToPath(import.meta.url);
const backendRoot = resolve(dirname(scriptPath), "..");
const workspaceRoot = resolve(backendRoot, "..");
const defaultSchemas = ["topik_bank", "topik_app"];
const managedSchemaNames = new Set([
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "net",
  "pgbouncer",
  "realtime",
  "storage",
  "supabase_functions",
  "supabase_migrations",
  "vault",
]);
const inheritedConnectionVariables = [
  "PGAPPNAME",
  "PGCONNECT_TIMEOUT",
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGOPTIONS",
  "PGPASSWORD",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLMODE",
  "PGUSER",
];

function usage() {
  return `로컬 PostgreSQL의 topik 스키마와 데이터를 Supabase로 복제합니다.

사용법:
  $env:SUPABASE_DB_URL = 'postgresql://postgres.<project-ref>:<encoded-password>@<pooler-host>:5432/postgres?sslmode=require'
  corepack pnpm db:copy-to-supabase -- --dry-run
  corepack pnpm db:copy-to-supabase -- --confirm-target-ref <project-ref>

옵션:
  --dry-run                       연결, 버전, 스키마, 행 수만 점검합니다.
  --confirm-target-ref <ref>      실제 복제에 필수인 Supabase 프로젝트 ref입니다.
  --schema <name>                 복제할 스키마입니다. 반복 지정할 수 있습니다.
                                  생략하면 topik_bank와 topik_app을 복제합니다.
  --backup-dir <path>             덤프와 대상 사전 백업을 보관할 디렉터리입니다.
  --help                          도움말을 표시합니다.

연결 문자열:
  source: LOCAL_DATABASE_URL 또는 backend/.env.development의 DATABASE_URL
  target: SUPABASE_DB_URL (환경변수로만 전달)

주의:
  정확한 스냅샷을 위해 실행 전에 로컬 백엔드와 DB 쓰기 작업을 중지하세요.
  대상의 선택된 스키마는 교체되지만 Supabase 관리 스키마는 변경하지 않습니다.`;
}

export function parseArguments(argv) {
  const options = {
    backupDir: undefined,
    confirmTargetRef: undefined,
    dryRun: false,
    help: false,
    schemas: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--schema" || argument === "--confirm-target-ref" || argument === "--backup-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} 옵션에 값이 필요합니다.`);
      }
      index += 1;
      if (argument === "--schema") options.schemas.push(value);
      if (argument === "--confirm-target-ref") options.confirmTargetRef = value;
      if (argument === "--backup-dir") options.backupDir = value;
    } else if (argument.startsWith("--schema=")) {
      options.schemas.push(argument.slice("--schema=".length));
    } else if (argument.startsWith("--confirm-target-ref=")) {
      options.confirmTargetRef = argument.slice("--confirm-target-ref=".length);
    } else if (argument.startsWith("--backup-dir=")) {
      options.backupDir = argument.slice("--backup-dir=".length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${argument}`);
    }
  }

  options.schemas = options.schemas.length ? options.schemas : [...defaultSchemas];
  return options;
}

export function validateSchemas(schemas) {
  const uniqueSchemas = [...new Set(schemas)];
  for (const schema of uniqueSchemas) {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
      throw new Error(`유효하지 않은 PostgreSQL 스키마 이름입니다: ${schema}`);
    }
    const normalized = schema.toLowerCase();
    if (
      normalized === "information_schema" ||
      normalized.startsWith("pg_") ||
      normalized.startsWith("supabase_") ||
      managedSchemaNames.has(normalized)
    ) {
      throw new Error(`Supabase 관리 스키마는 복제할 수 없습니다: ${schema}`);
    }
  }
  return uniqueSchemas;
}

export function parseConnectionString(rawValue, kind) {
  if (!rawValue) {
    throw new Error(`${kind} 데이터베이스 연결 문자열이 없습니다.`);
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${kind} 데이터베이스 연결 문자열 형식이 올바르지 않습니다.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${kind} 연결 문자열은 postgres:// 또는 postgresql:// 형식이어야 합니다.`);
  }

  const decode = (value, label) => {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new Error(`${kind} 연결 문자열의 ${label} 값이 올바르게 URL 인코딩되지 않았습니다.`);
    }
  };
  const database = decode(parsed.pathname.replace(/^\/+/, ""), "database");
  const username = decode(parsed.username, "username");
  const password = decode(parsed.password, "password");
  if (!parsed.hostname || !database || !username) {
    throw new Error(`${kind} 연결 문자열에는 host, database, username이 모두 필요합니다.`);
  }

  return {
    database,
    host: parsed.hostname,
    password,
    port: parsed.port || "5432",
    rawValue,
    sslmode: parsed.searchParams.get("sslmode") || (kind === "target" ? "require" : "prefer"),
    username,
  };
}

export function extractSupabaseProjectRef(connection) {
  const directHost = connection.host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (directHost) return directHost[1];
  const poolerUser = connection.username.match(/^postgres\.([a-z0-9]+)$/i);
  return poolerUser?.[1];
}

function isSupabaseHost(host) {
  const normalized = host.toLowerCase();
  return normalized.endsWith(".supabase.co") || normalized.endsWith(".supabase.com");
}

function connectionEnvironment(connection) {
  const environment = { ...process.env };
  for (const name of inheritedConnectionVariables) delete environment[name];
  Object.assign(environment, {
    PGAPPNAME: "unigate-postgres-to-supabase-copy",
    PGCLIENTENCODING: "UTF8",
    PGCONNECT_TIMEOUT: "15",
    PGDATABASE: connection.database,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGSSLMODE: connection.sslmode,
    PGUSER: connection.username,
  });
  if (connection.password) environment.PGPASSWORD = connection.password;
  return environment;
}

function sanitizedFailure(result, label, connections = []) {
  let detail = result.stderr?.toString().trim() || result.error?.message || `exit code ${result.status}`;
  for (const connection of connections) {
    if (connection.rawValue) detail = detail.replaceAll(connection.rawValue, "[REDACTED_DATABASE_URL]");
    if (connection.password) detail = detail.replaceAll(connection.password, "[REDACTED_PASSWORD]");
  }
  return new Error(`${label} 실패: ${detail}`);
}

function runCaptured(command, arguments_, environment, label, connections = []) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw sanitizedFailure(result, label, connections);
  return result.stdout.trim();
}

function runStreaming(command, arguments_, environment, label, connections = []) {
  const result = spawnSync(command, arguments_, {
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw sanitizedFailure(result, label, connections);
}

function postgresToolVersions() {
  const versions = {};
  for (const command of ["pg_dump", "pg_restore", "psql"]) {
    versions[command] = runCaptured(command, ["--version"], process.env, `${command} 확인`);
  }
  return versions;
}

function toolMajor(versionOutput) {
  const match = versionOutput.match(/PostgreSQL\)\s+(\d+)/i);
  if (!match) throw new Error(`PostgreSQL 도구 버전을 해석할 수 없습니다: ${versionOutput}`);
  return Number(match[1]);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotedIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function psqlJson(connection, sql, label) {
  const output = runCaptured(
    "psql",
    [
      "--no-psqlrc",
      "--no-password",
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--dbname",
      connection.database,
      "--command",
      sql,
    ],
    connectionEnvironment(connection),
    label,
    [connection],
  );
  const lastLine = output.split(/\r?\n/).filter(Boolean).at(-1);
  try {
    return JSON.parse(lastLine || "null");
  } catch {
    throw new Error(`${label} 결과를 JSON으로 해석할 수 없습니다.`);
  }
}

function databaseMetadata(connection, schemas, label) {
  const schemaList = schemas.map(sqlLiteral).join(", ");
  return psqlJson(
    connection,
    `SELECT json_build_object(
       'database', current_database(),
       'user', current_user,
       'serverVersionNum', current_setting('server_version_num')::integer,
       'sizeBytes', pg_database_size(current_database()),
       'otherConnections', (
         SELECT COUNT(*) FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>pg_backend_pid()
       ),
       'schemas', COALESCE((
         SELECT json_agg(nspname ORDER BY nspname)
           FROM pg_namespace WHERE nspname IN (${schemaList})
       ), '[]'::json),
       'extensions', COALESCE((
         SELECT json_agg(extname ORDER BY extname)
           FROM pg_extension WHERE extname<>'plpgsql'
       ), '[]'::json)
     )::text;`,
    `${label} 메타데이터 조회`,
  );
}

function databaseTables(connection, schemas, label) {
  const schemaList = schemas.map(sqlLiteral).join(", ");
  return psqlJson(
    connection,
    `SELECT COALESCE(json_agg(json_build_array(n.nspname,c.relname)
                             ORDER BY n.nspname,c.relname), '[]'::json)::text
       FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r','p');`,
    `${label} 테이블 목록 조회`,
  );
}

function tableRowCounts(connection, tables, label) {
  if (!tables.length) return {};
  const countQueries = tables.map(([schema, table]) => {
    const displayName = `${schema}.${table}`;
    return `SELECT ${sqlLiteral(displayName)} AS table_name, COUNT(*)::bigint AS row_count FROM ${quotedIdentifier(schema)}.${quotedIdentifier(table)}`;
  });
  return psqlJson(
    connection,
    `SELECT COALESCE(json_object_agg(table_name,row_count), '{}'::json)::text
       FROM (${countQueries.join(" UNION ALL ")}) AS counts;`,
    `${label} 행 수 조회`,
  );
}

function dumpSchemas(connection, schemas, outputPath, label) {
  const schemaArguments = schemas.flatMap((schema) => ["--schema", schema]);
  runStreaming(
    "pg_dump",
    [
      "--dbname",
      connection.database,
      "--format=custom",
      "--file",
      outputPath,
      "--no-owner",
      "--no-privileges",
      "--no-subscriptions",
      "--no-publications",
      "--no-security-labels",
      "--no-tablespaces",
      "--verbose",
      ...schemaArguments,
    ],
    connectionEnvironment(connection),
    label,
    [connection],
  );
}

function restoreSchemas(connection, inputPath) {
  runStreaming(
    "pg_restore",
    [
      "--dbname",
      connection.database,
      "--clean",
      "--if-exists",
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--no-tablespaces",
      "--verbose",
      inputPath,
    ],
    connectionEnvironment(connection),
    "Supabase 복원",
    [connection],
  );
}

function sortedTableNames(tables) {
  return tables.map(([schema, table]) => `${schema}.${table}`).sort();
}

function compareSnapshots(expectedTables, expectedCounts, actualTables, actualCounts) {
  const expectedNames = sortedTableNames(expectedTables);
  const actualNames = sortedTableNames(actualTables);
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
    throw new Error("복원 후 Supabase의 테이블 목록이 로컬 원본과 일치하지 않습니다.");
  }
  for (const tableName of expectedNames) {
    if (String(expectedCounts[tableName]) !== String(actualCounts[tableName])) {
      throw new Error(
        `복원 후 행 수가 일치하지 않습니다: ${tableName} (local=${expectedCounts[tableName]}, supabase=${actualCounts[tableName]})`,
      );
    }
  }
}

function sameDatabase(left, right) {
  return left.host.toLowerCase() === right.host.toLowerCase()
    && left.port === right.port
    && left.database === right.database;
}

async function localDatabaseUrl() {
  if (process.env.LOCAL_DATABASE_URL) return process.env.LOCAL_DATABASE_URL;
  const environmentPath = resolve(backendRoot, ".env.development");
  if (!existsSync(environmentPath)) return undefined;
  const values = parseEnv(await readFile(environmentPath));
  return values.DATABASE_URL;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function ensureEmptyBackupDirectory(path) {
  await mkdir(path, { recursive: true });
  if ((await readdir(path)).length) {
    throw new Error(`백업 디렉터리가 비어 있지 않습니다: ${path}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const schemas = validateSchemas(options.schemas);
  const source = parseConnectionString(await localDatabaseUrl(), "source");
  const target = parseConnectionString(process.env.SUPABASE_DB_URL, "target");
  if (!isSupabaseHost(target.host)) {
    throw new Error(`대상 host가 Supabase 주소가 아닙니다: ${target.host}`);
  }
  if (sameDatabase(source, target)) {
    throw new Error("원본과 대상 데이터베이스가 같습니다. 복제를 중단합니다.");
  }

  const actualProjectRef = extractSupabaseProjectRef(target);
  const confirmedProjectRef = options.confirmTargetRef || process.env.SUPABASE_PROJECT_REF;
  if (!options.dryRun && !confirmedProjectRef) {
    throw new Error("실제 복제에는 --confirm-target-ref <project-ref>가 필요합니다.");
  }
  if (confirmedProjectRef && actualProjectRef !== confirmedProjectRef) {
    throw new Error(
      `확인한 프로젝트 ref(${confirmedProjectRef})가 대상 연결 문자열의 ref(${actualProjectRef || "확인 불가"})와 다릅니다.`,
    );
  }

  const versions = postgresToolVersions();
  const sourceMetadata = databaseMetadata(source, schemas, "로컬 원본");
  const targetMetadata = databaseMetadata(target, schemas, "Supabase 대상");
  const sourceMajor = Math.floor(Number(sourceMetadata.serverVersionNum) / 10_000);
  const targetMajor = Math.floor(Number(targetMetadata.serverVersionNum) / 10_000);
  const dumpToolMajor = toolMajor(versions.pg_dump);
  if (dumpToolMajor < sourceMajor) {
    throw new Error(`pg_dump ${dumpToolMajor}은 원본 PostgreSQL ${sourceMajor}보다 오래되었습니다.`);
  }
  if (sourceMajor > targetMajor) {
    throw new Error(
      `원본 PostgreSQL ${sourceMajor}을 더 오래된 Supabase PostgreSQL ${targetMajor}로 안전하게 복원할 수 없습니다.`,
    );
  }

  const missingSchemas = schemas.filter((schema) => !sourceMetadata.schemas.includes(schema));
  if (missingSchemas.length) {
    throw new Error(`로컬 원본에 스키마가 없습니다: ${missingSchemas.join(", ")}`);
  }
  const missingExtensions = sourceMetadata.extensions.filter(
    (extension) => !targetMetadata.extensions.includes(extension),
  );
  if (missingExtensions.length) {
    process.stderr.write(
      `주의: Supabase에 없는 원본 확장 기능이 있습니다: ${missingExtensions.join(", ")}\n` +
      "선택한 스키마가 해당 확장 기능에 의존하면 Dashboard에서 먼저 활성화해야 합니다.\n",
    );
  }
  if (Number(sourceMetadata.otherConnections) > 0) {
    process.stderr.write(
      `주의: 로컬 DB에 다른 연결 ${sourceMetadata.otherConnections}개가 있습니다. 쓰기 작업을 중지했는지 확인하세요.\n`,
    );
  }

  const sourceTables = databaseTables(source, schemas, "로컬 원본");
  const sourceCountsBeforeDump = tableRowCounts(source, sourceTables, "로컬 원본");
  process.stdout.write(
    `점검 완료: local PostgreSQL ${sourceMajor}, Supabase PostgreSQL ${targetMajor}, ` +
    `${sourceTables.length}개 테이블, ${schemas.join(", ")}\n`,
  );
  if (options.dryRun) {
    process.stdout.write("Dry run 완료: 대상 데이터는 변경하지 않았습니다.\n");
    return;
  }

  const backupDirectory = resolve(
    options.backupDir || resolve(workspaceRoot, ".tmp", "postgres-to-supabase", timestampForPath()),
  );
  await ensureEmptyBackupDirectory(backupDirectory);
  const sourceDumpPath = resolve(backupDirectory, "source.dump");
  const targetBackupPath = resolve(backupDirectory, "target-before.dump");
  const manifestPath = resolve(backupDirectory, "manifest.json");
  const manifest = {
    status: "started",
    startedAt: new Date().toISOString(),
    schemas,
    source: {
      database: source.database,
      host: source.host,
      postgresMajor: sourceMajor,
      tableCount: sourceTables.length,
    },
    target: {
      database: target.database,
      host: target.host,
      postgresMajor: targetMajor,
      projectRef: actualProjectRef,
    },
    tools: versions,
  };
  const writeManifest = () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeManifest();

  try {
    process.stdout.write(`로컬 원본 덤프 생성: ${sourceDumpPath}\n`);
    dumpSchemas(source, schemas, sourceDumpPath, "로컬 원본 덤프");

    const sourceCountsAfterDump = tableRowCounts(source, sourceTables, "덤프 후 로컬 원본");
    for (const tableName of Object.keys(sourceCountsBeforeDump)) {
      if (String(sourceCountsBeforeDump[tableName]) !== String(sourceCountsAfterDump[tableName])) {
        throw new Error(`덤프 중 로컬 데이터가 변경되었습니다: ${tableName}. 쓰기를 중지하고 다시 실행하세요.`);
      }
    }

    const existingTargetSchemas = schemas.filter((schema) => targetMetadata.schemas.includes(schema));
    if (existingTargetSchemas.length) {
      process.stdout.write(`Supabase 기존 데이터 백업: ${targetBackupPath}\n`);
      dumpSchemas(target, existingTargetSchemas, targetBackupPath, "Supabase 대상 사전 백업");
      manifest.targetBackup = targetBackupPath;
    } else {
      manifest.targetBackup = null;
    }
    manifest.status = "backed-up";
    await writeManifest();

    process.stdout.write(`Supabase 프로젝트 ${actualProjectRef}에 복원합니다.\n`);
    restoreSchemas(target, sourceDumpPath);

    const targetTables = databaseTables(target, schemas, "복원된 Supabase 대상");
    const targetCounts = tableRowCounts(target, targetTables, "복원된 Supabase 대상");
    compareSnapshots(sourceTables, sourceCountsAfterDump, targetTables, targetCounts);

    manifest.status = "complete";
    manifest.completedAt = new Date().toISOString();
    manifest.rowCounts = sourceCountsAfterDump;
    await writeManifest();
    process.stdout.write(
      `복제 완료: ${targetTables.length}개 테이블의 행 수가 일치합니다.\n` +
      `덤프와 복구용 백업: ${backupDirectory}\n`,
    );
  } catch (error) {
    manifest.status = "failed";
    manifest.failedAt = new Date().toISOString();
    manifest.error = error instanceof Error ? error.message : String(error);
    await writeManifest();
    throw error;
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
