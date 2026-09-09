import { Readable } from "node:stream";
import { z } from "zod";
import { pool } from "./db.js";
import { AppError } from "./errors.js";

export const adminExportDatasets = ["questions", "responses", "sessions"] as const;
export type AdminExportDataset = (typeof adminExportDatasets)[number];

export type AdminExportFilters = {
  mockTestId?: string;
  section?: "reading" | "listening";
  mode?: "timed" | "practice";
  status: "submitted" | "abandoned" | "all";
  from?: string;
  to?: string;
  itemType?: string;
  minAssignedCount: number;
  outcome: "all" | "answered" | "correct" | "incorrect" | "unanswered";
  rating: "all" | "none" | "1" | "2" | "3" | "4" | "5";
  resultEmail: "all" | "accepted" | "not_accepted";
};

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

const exportFilterSchema = z.object({
  mockTestId: z.string().uuid().optional(),
  section: z.enum(["reading", "listening"]).optional(),
  mode: z.enum(["timed", "practice"]).optional(),
  status: z.enum(["submitted", "abandoned", "all"]).default("submitted"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  itemType: z.string().trim().min(1).max(100).optional(),
  minAssignedCount: z.coerce.number().int().min(0).max(1_000_000).default(0),
  outcome: z.enum(["all", "answered", "correct", "incorrect", "unanswered"]).default("all"),
  rating: z.enum(["all", "none", "1", "2", "3", "4", "5"]).default("all"),
  resultEmail: z.enum(["all", "accepted", "not_accepted"]).default("all"),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date" });
  }
});

export function parseAdminExportFilters(input: unknown, dataset?: AdminExportDataset): AdminExportFilters {
  const result = exportFilterSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, "INVALID_EXPORT_FILTER", "Invalid export filters");
  }
  if (dataset === "questions") {
    return { ...result.data, outcome: "all", rating: "all", resultEmail: "all" };
  }
  if (dataset === "responses") {
    return { ...result.data, itemType: undefined, minAssignedCount: 0, rating: "all", resultEmail: "all" };
  }
  if (dataset === "sessions") {
    return { ...result.data, itemType: undefined, minAssignedCount: 0, outcome: "all" };
  }
  return result.data;
}

type SqlQuery = { text: string; values: unknown[] };
type CsvColumn = { key: string; header: string };

const columns: Record<AdminExportDataset, CsvColumn[]> = {
  questions: [
    "mock_test_id", "mock_test_slug", "mock_test_title_ko", "mock_test_title_en",
    "section", "set_id", "set_version", "test_position", "item_id", "item_version",
    "item_type", "primary_skill", "target_level", "predicted_difficulty", "irt_difficulty",
    "irt_discrimination", "question_prompt", "stem", "passage", "auxiliary_text",
    "highlight_text", "choice_1", "choice_2", "choice_3", "choice_4", "correct_answer",
    "explanation", "transcript_json", "visual_options_json", "content_json",
    "assigned_count", "answered_count", "unanswered_count", "correct_count", "incorrect_count",
    "answered_accuracy_pct", "overall_accuracy_pct", "option_1_count", "option_2_count",
    "option_3_count", "option_4_count", "option_1_pct", "option_2_pct", "option_3_pct",
    "option_4_pct", "avg_answered_response_time_ms", "median_answered_response_time_ms",
    "answer_changed_count", "answer_changed_rate_pct",
  ].map((key) => ({ key, header: key })),
  responses: [
    "session_id", "user_id", "mock_test_id", "mock_test_slug", "mock_test_title_ko",
    "mock_test_title_en", "mode", "status", "started_at", "completed_at",
    "timed_out_submission", "session_score", "max_score", "score_pct", "rating",
    "feedback_locale", "section", "set_id", "set_version", "item_order", "test_position",
    "item_id", "item_version", "item_type", "selected_option", "correct_answer",
    "response_outcome", "is_correct", "response_time_ms", "skipped", "timed_out",
    "answer_changed", "selection_count", "first_selected_at", "final_selected_at", "policy_version",
  ].map((key) => ({ key, header: key })),
  sessions: [
    "session_id", "user_id", "mock_test_id", "mock_test_slug", "mock_test_title_ko",
    "mock_test_title_en", "mode", "status", "started_at", "submitted_at", "abandoned_at",
    "completed_at", "duration_seconds", "timed_out_submission", "score", "max_score",
    "score_pct", "total_items", "answered_count", "unanswered_count", "correct_count",
    "incorrect_count", "rating", "feedback_locale", "result_email", "result_email_accepted",
  ].map((key) => ({ key, header: key })),
};

function buildSessionFilters(filters: AdminExportFilters, values: unknown[], alias = "s") {
  const clauses: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.status === "all") clauses.push(`${alias}.status IN ('submitted','abandoned')`);
  else clauses.push(`${alias}.status=${parameter(filters.status)}`);
  if (filters.mockTestId) clauses.push(`${alias}.mock_test_id=${parameter(filters.mockTestId)}`);
  if (filters.mode) clauses.push(`${alias}.mode=${parameter(filters.mode)}`);
  if (filters.from) {
    clauses.push(`COALESCE(${alias}.submitted_at,${alias}.abandoned_at) >= (${parameter(filters.from)}::date AT TIME ZONE 'Asia/Seoul')`);
  }
  if (filters.to) {
    clauses.push(`COALESCE(${alias}.submitted_at,${alias}.abandoned_at) < ((${parameter(filters.to)}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')`);
  }
  if (filters.section) {
    clauses.push(`EXISTS (SELECT 1 FROM topik_app.session_items section_item WHERE section_item.session_id=${alias}.session_id AND section_item.section=${parameter(filters.section)})`);
  }
  return clauses;
}

function questionQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const inventoryFilters: string[] = [];
  const responseFilters: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.mockTestId) inventoryFilters.push(`mt.mock_test_id=${parameter(filters.mockTestId)}`);
  if (filters.section) inventoryFilters.push(`mts.section=${parameter(filters.section)}`);
  if (filters.itemType) {
    inventoryFilters.push(`iv.item_type=${parameter(filters.itemType)}`);
    responseFilters.push(`iv.item_type=${parameter(filters.itemType)}`);
  }
  if (filters.section) responseFilters.push(`si.section=${parameter(filters.section)}`);
  const minimum = parameter(filters.minAssignedCount);
  const text = `
    WITH filtered_sessions AS (
      SELECT s.*,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at
        FROM topik_app.sessions s
       WHERE ${sessionFilters.join(" AND ")}
    ), question_inventory AS (
      SELECT mt.mock_test_id,mt.slug AS mock_test_slug,mt.title_ko AS mock_test_title_ko,
             mt.title_en AS mock_test_title_en,mts.section,qsi.set_id,qsi.set_version,
             qsi.position AS test_position,iv.item_id,iv.item_version,iv.item_type,
             iv.primary_skill,iv.target_level,iv.predicted_difficulty,iv.irt_difficulty,
             iv.irt_discrimination,COALESCE(iv.content_json->>'question_prompt','') AS question_prompt,
             COALESCE(NULLIF(iv.content_json->>'stem',''),iv.stem,'') AS stem,
             COALESCE(iv.content_json->>'passage','') AS passage,
             COALESCE(iv.content_json->>'auxiliary_text','') AS auxiliary_text,
             COALESCE(iv.content_json->>'highlight_text','') AS highlight_text,
             COALESCE(iv.content_json->'choices',iv.choices,'[]'::jsonb) AS export_choices,
             iv.correct_answer,iv.explanation,COALESCE(iv.content_json->'dialogue_turns','[]'::jsonb) AS transcript_json,
             COALESCE(iv.content_json->'visual_options','[]'::jsonb) AS visual_options_json,
             iv.content_json
        FROM topik_app.mock_tests mt
        JOIN topik_app.mock_test_sections mts ON mts.mock_test_id=mt.mock_test_id
        JOIN topik_bank.question_set_items qsi ON qsi.set_id=mts.set_id AND qsi.set_version=mts.set_version
        JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
       ${inventoryFilters.length ? `WHERE ${inventoryFilters.join(" AND ")}` : ""}
      UNION
      SELECT mt.mock_test_id,mt.slug,mt.title_ko,mt.title_en,si.section,si.set_id,si.set_version,
             si.test_position,iv.item_id,iv.item_version,iv.item_type,iv.primary_skill,
             iv.target_level,iv.predicted_difficulty,iv.irt_difficulty,iv.irt_discrimination,
             COALESCE(iv.content_json->>'question_prompt',''),
             COALESCE(NULLIF(iv.content_json->>'stem',''),iv.stem,''),
             COALESCE(iv.content_json->>'passage',''),COALESCE(iv.content_json->>'auxiliary_text',''),
             COALESCE(iv.content_json->>'highlight_text',''),
             COALESCE(iv.content_json->'choices',iv.choices,'[]'::jsonb),iv.correct_answer,iv.explanation,
             COALESCE(iv.content_json->'dialogue_turns','[]'::jsonb),
             COALESCE(iv.content_json->'visual_options','[]'::jsonb),iv.content_json
        FROM filtered_sessions fs
        JOIN topik_app.mock_tests mt ON mt.mock_test_id=fs.mock_test_id
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
       ${responseFilters.length ? `WHERE ${responseFilters.join(" AND ")}` : ""}
    ), response_rows AS (
      SELECT fs.mock_test_id,si.section,si.set_id,si.set_version,si.test_position,si.item_id,si.item_version,
             COALESCE(ro.selected_option,a.selected_option) AS selected_option,
             iv.correct_answer,
             CASE WHEN ro.observation_id IS NOT NULL THEN ro.response_time_ms ELSE COALESCE((
               SELECT SUM(e.active_duration_delta_ms)::int FROM topik_app.response_events e
                WHERE e.session_id=fs.session_id AND e.item_order=si.item_order
             ),0) END AS response_time_ms,
             COALESCE(ro.answer_changed,a.selection_count>1,FALSE) AS answer_changed
        FROM filtered_sessions fs
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
        LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
        LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
       ${responseFilters.length ? `WHERE ${responseFilters.join(" AND ")}` : ""}
    ), stats AS (
      SELECT mock_test_id,section,set_id,set_version,test_position,item_id,item_version,
             COUNT(*)::int AS assigned_count,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL)::int AS answered_count,
             COUNT(*) FILTER (WHERE selected_option IS NULL)::int AS unanswered_count,
             COUNT(*) FILTER (WHERE selected_option=correct_answer)::int AS correct_count,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL AND selected_option<>correct_answer)::int AS incorrect_count,
             COUNT(*) FILTER (WHERE selected_option=1)::int AS option_1_count,
             COUNT(*) FILTER (WHERE selected_option=2)::int AS option_2_count,
             COUNT(*) FILTER (WHERE selected_option=3)::int AS option_3_count,
             COUNT(*) FILTER (WHERE selected_option=4)::int AS option_4_count,
             ROUND(AVG(response_time_ms) FILTER (WHERE selected_option IS NOT NULL),2) AS avg_answered_response_time_ms,
             ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms)
               FILTER (WHERE selected_option IS NOT NULL))::numeric,2) AS median_answered_response_time_ms,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL AND answer_changed)::int AS answer_changed_count
        FROM response_rows
       GROUP BY mock_test_id,section,set_id,set_version,test_position,item_id,item_version
    )
    SELECT qi.mock_test_id,qi.mock_test_slug,qi.mock_test_title_ko,qi.mock_test_title_en,
           qi.section,qi.set_id,qi.set_version,qi.test_position,qi.item_id,qi.item_version,
           qi.item_type,qi.primary_skill,qi.target_level,qi.predicted_difficulty,qi.irt_difficulty,
           qi.irt_discrimination,qi.question_prompt,qi.stem,qi.passage,qi.auxiliary_text,
           qi.highlight_text,qi.export_choices->>0 AS choice_1,qi.export_choices->>1 AS choice_2,
           qi.export_choices->>2 AS choice_3,qi.export_choices->>3 AS choice_4,qi.correct_answer,
           qi.explanation,qi.transcript_json::text AS transcript_json,
           qi.visual_options_json::text AS visual_options_json,qi.content_json::text AS content_json,
           COALESCE(st.assigned_count,0) AS assigned_count,COALESCE(st.answered_count,0) AS answered_count,
           COALESCE(st.unanswered_count,0) AS unanswered_count,COALESCE(st.correct_count,0) AS correct_count,
           COALESCE(st.incorrect_count,0) AS incorrect_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.correct_count*100.0/st.answered_count,2) END AS answered_accuracy_pct,
           CASE WHEN st.assigned_count>0 THEN ROUND(st.correct_count*100.0/st.assigned_count,2) END AS overall_accuracy_pct,
           COALESCE(st.option_1_count,0) AS option_1_count,COALESCE(st.option_2_count,0) AS option_2_count,
           COALESCE(st.option_3_count,0) AS option_3_count,COALESCE(st.option_4_count,0) AS option_4_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_1_count*100.0/st.answered_count,2) END AS option_1_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_2_count*100.0/st.answered_count,2) END AS option_2_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_3_count*100.0/st.answered_count,2) END AS option_3_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_4_count*100.0/st.answered_count,2) END AS option_4_pct,
           st.avg_answered_response_time_ms,st.median_answered_response_time_ms,
           COALESCE(st.answer_changed_count,0) AS answer_changed_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.answer_changed_count*100.0/st.answered_count,2) END AS answer_changed_rate_pct
      FROM question_inventory qi
      LEFT JOIN stats st ON st.mock_test_id=qi.mock_test_id AND st.section=qi.section
       AND st.set_id=qi.set_id AND st.set_version=qi.set_version AND st.test_position=qi.test_position
       AND st.item_id=qi.item_id AND st.item_version=qi.item_version
     WHERE COALESCE(st.assigned_count,0) >= ${minimum}
     ${ordered ? "ORDER BY qi.mock_test_slug,qi.section,qi.test_position,qi.set_version,qi.item_version" : ""}`;
  return { text, values };
}

function responseQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const rowFilters: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.section) rowFilters.push(`response_rows.section=${parameter(filters.section)}`);
  if (filters.outcome === "answered") rowFilters.push("response_rows.response_outcome IN ('correct','incorrect')");
  if (["correct", "incorrect", "unanswered"].includes(filters.outcome)) {
    rowFilters.push(`response_rows.response_outcome=${parameter(filters.outcome)}`);
  }
  const text = `
    WITH filtered_sessions AS (
      SELECT s.*,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at
        FROM topik_app.sessions s WHERE ${sessionFilters.join(" AND ")}
    ), response_rows AS (
      SELECT fs.session_id,fs.user_id,fs.mock_test_id,mt.slug AS mock_test_slug,
             mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en,
             fs.mode,fs.status,fs.started_at,fs.completed_at,fs.timed_out_submission,
             fs.score AS session_score,fs.max_score,
             CASE WHEN fs.score IS NOT NULL AND fs.max_score>0 THEN ROUND(fs.score*100.0/fs.max_score,2) END AS score_pct,
             af.rating,af.locale AS feedback_locale,si.section,si.set_id,si.set_version,si.item_order,
             si.test_position,si.item_id,si.item_version,iv.item_type,
             COALESCE(ro.selected_option,a.selected_option) AS selected_option,iv.correct_answer,
             CASE WHEN COALESCE(ro.selected_option,a.selected_option) IS NULL THEN 'unanswered'
                  WHEN COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer THEN 'correct'
                  ELSE 'incorrect' END AS response_outcome,
             CASE WHEN COALESCE(ro.selected_option,a.selected_option) IS NULL THEN NULL
                  ELSE COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer END AS is_correct,
             CASE WHEN ro.observation_id IS NOT NULL THEN ro.response_time_ms ELSE COALESCE((
               SELECT SUM(e.active_duration_delta_ms)::int FROM topik_app.response_events e
                WHERE e.session_id=fs.session_id AND e.item_order=si.item_order
             ),0) END AS response_time_ms,
             CASE WHEN fs.status='submitted' THEN ro.skipped END AS skipped,
             CASE WHEN fs.status='submitted' THEN ro.timed_out END AS timed_out,
             COALESCE(ro.answer_changed,a.selection_count>1,FALSE) AS answer_changed,
             COALESCE(a.selection_count,0) AS selection_count,a.first_selected_at,a.final_selected_at,
             si.policy_version
        FROM filtered_sessions fs
        JOIN topik_app.mock_tests mt ON mt.mock_test_id=fs.mock_test_id
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
        LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
        LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
        LEFT JOIN topik_app.attempt_feedback af ON af.session_id=fs.session_id
    )
    SELECT * FROM response_rows
     ${rowFilters.length ? `WHERE ${rowFilters.join(" AND ")}` : ""}
     ${ordered ? "ORDER BY completed_at,session_id,item_order" : ""}`;
  return { text, values };
}

function sessionQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const having: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.rating === "none") sessionFilters.push("af.rating IS NULL");
  else if (filters.rating !== "all") sessionFilters.push(`af.rating=${parameter(Number(filters.rating))}`);
  if (filters.resultEmail === "accepted") sessionFilters.push("email_state.result_email IS NOT NULL");
  if (filters.resultEmail === "not_accepted") sessionFilters.push("email_state.result_email IS NULL");
  if (filters.section) having.push(`BOOL_OR(si.section=${parameter(filters.section)})`);
  const text = `
    SELECT s.session_id,s.user_id,s.mock_test_id,mt.slug AS mock_test_slug,
           mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en,s.mode,s.status,
           s.started_at,s.submitted_at,s.abandoned_at,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at,
           FLOOR(EXTRACT(EPOCH FROM (COALESCE(s.submitted_at,s.abandoned_at)-s.started_at)))::int AS duration_seconds,
           s.timed_out_submission,s.score,s.max_score,
           CASE WHEN s.score IS NOT NULL AND s.max_score>0 THEN ROUND(s.score*100.0/s.max_score,2) END AS score_pct,
           COUNT(si.item_order)::int AS total_items,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NOT NULL)::int AS answered_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NULL)::int AS unanswered_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer)::int AS correct_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NOT NULL
             AND COALESCE(ro.selected_option,a.selected_option)<>iv.correct_answer)::int AS incorrect_count,
           af.rating,af.locale AS feedback_locale,email_state.result_email,
           (email_state.result_email IS NOT NULL) AS result_email_accepted
      FROM topik_app.sessions s
      JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
      JOIN topik_app.session_items si ON si.session_id=s.session_id
      JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
      LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
      LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
      LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
      LEFT JOIN LATERAL (
        SELECT red.email_original AS result_email
          FROM topik_app.result_email_deliveries red
         WHERE red.session_id=s.session_id
           AND red.status='accepted'
           AND red.revoked_at IS NULL
         ORDER BY red.accepted_at DESC NULLS LAST,red.requested_at DESC
         LIMIT 1
      ) email_state ON TRUE
     WHERE ${sessionFilters.join(" AND ")}
     GROUP BY s.session_id,mt.slug,mt.title_ko,mt.title_en,af.rating,af.locale,email_state.result_email
     ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
     ${ordered ? "ORDER BY completed_at,session_id" : ""}`;
  return { text, values };
}

export function buildAdminExportQuery(dataset: AdminExportDataset, filters: AdminExportFilters, ordered = true): SqlQuery {
  if (dataset === "questions") return questionQuery(filters, ordered);
  if (dataset === "responses") return responseQuery(filters, ordered);
  return sessionQuery(filters, ordered);
}

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
    return Readable.from(csvChunks(columns[dataset], cursorRows(buildAdminExportQuery(dataset, filters))));
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
