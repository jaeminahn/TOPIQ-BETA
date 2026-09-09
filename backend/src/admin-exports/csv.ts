import { Readable } from "node:stream";
import { pool } from "../db.js";
import type { CsvColumn, SqlQuery } from "./types.js";

function escapeFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const normalized = value instanceof Date
    ? value.toISOString()
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return `"${escapeFormula(normalized).replace(/"/g, '""')}"`;
}

export function encodeCsvRow(values: unknown[]) {
  return `${values.map(csvCell).join(",")}\r\n`;
}

async function* csvChunks(csvColumns: CsvColumn[], rows: AsyncIterable<Record<string, unknown>>) {
  yield `\uFEFF${encodeCsvRow(csvColumns.map((column) => column.header))}`;
  for await (const row of rows) yield encodeCsvRow(csvColumns.map((column) => row[column.key]));
}

async function* cursorRows(query: SqlQuery) {
  const client = await pool.connect();
  let transaction = false;
  try {
    await client.query("BEGIN READ ONLY");
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '5min'");
    await client.query(`DECLARE admin_export_cursor NO SCROLL CURSOR FOR ${query.text}`, query.values);
    while (true) {
      const batch = await client.query<Record<string, unknown>>("FETCH FORWARD 1000 FROM admin_export_cursor");
      if (!batch.rows.length) break;
      for (const row of batch.rows) yield row;
    }
    await client.query("CLOSE admin_export_cursor");
    await client.query("COMMIT");
    transaction = false;
  } finally {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}


export function createCsvStream(csvColumns: CsvColumn[], query: SqlQuery) {
  return Readable.from(csvChunks(csvColumns, cursorRows(query)));
}
