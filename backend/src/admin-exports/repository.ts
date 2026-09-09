import type { Readable } from "node:stream";
import { pool } from "../db.js";
import { createCsvStream } from "./csv.js";
import { buildAdminExportQuery, buildSessionFilters } from "./queries.js";
import { columns, type AdminExportDataset, type AdminExportFilters } from "./types.js";

export interface AdminExportSource {
  options(): Promise<unknown>;
  preview(dataset: AdminExportDataset, filters: AdminExportFilters): Promise<{ rowCount: number; sessionCount: number }>;
  csvStream(dataset: AdminExportDataset, filters: AdminExportFilters): Readable;
}

export class AdminExportRepository implements AdminExportSource {
  async options() {
    const [mockTests, itemTypes] = await Promise.all([
      pool.query(`SELECT mock_test_id AS "mockTestId",slug,title_ko AS "titleKo",title_en AS "titleEn",
                         is_published AS "isPublished" FROM topik_app.mock_tests ORDER BY display_order,slug`),
      pool.query<{ itemType: string }>(`SELECT DISTINCT item_type AS "itemType" FROM topik_bank.item_versions ORDER BY item_type`),
    ]);
    return { mockTests: mockTests.rows, itemTypes: itemTypes.rows.map((row) => row.itemType) };
  }

  async preview(dataset: AdminExportDataset, filters: AdminExportFilters) {
    const query = buildAdminExportQuery(dataset, filters, false);
    const rowCount = await pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM (${query.text}) export_rows`, query.values);
    if (dataset === "sessions") {
      const count = rowCount.rows[0]?.count ?? 0;
      return { rowCount: count, sessionCount: count };
    }
    const sessionValues: unknown[] = [];
    const sessionFilters = buildSessionFilters(filters, sessionValues);
    const sessionCount = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM topik_app.sessions s WHERE ${sessionFilters.join(" AND ")}`,
      sessionValues,
    );
    return { rowCount: rowCount.rows[0]?.count ?? 0, sessionCount: sessionCount.rows[0]?.count ?? 0 };
  }

  csvStream(dataset: AdminExportDataset, filters: AdminExportFilters) {
    return createCsvStream(columns[dataset], buildAdminExportQuery(dataset, filters));
  }
}

export function exportFilename(dataset: AdminExportDataset, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `unigate_${dataset}_${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}_KST.csv`;
}
