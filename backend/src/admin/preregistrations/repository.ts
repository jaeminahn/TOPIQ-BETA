import { pool } from "../../core/db.js";
import { createCsvStream } from "../exports/csv.js";
import type { SqlQuery } from "../exports/types.js";
import type { PreregistrationFilters } from "./filters.js";

export const preregistrationColumns = [
  "registration_id", "email_original", "source", "source_code", "consented_at",
  "locale", "privacy_consent", "marketing_consent", "consent_version",
].map((key) => ({ key, header: key }));

export function buildPreregistrationQuery(filters: PreregistrationFilters): SqlQuery {
  const values: unknown[] = [];
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const clauses: string[] = [];
  if (filters.source) clauses.push(`source=${parameter(filters.source)}`);
  if (filters.from) clauses.push(`consented_at >= (${parameter(filters.from)}::date AT TIME ZONE 'Asia/Seoul')`);
  if (filters.to) clauses.push(`consented_at < ((${parameter(filters.to)}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')`);
  if (filters.search) clauses.push(`strpos(email_normalized,${parameter(filters.search.toLocaleLowerCase("en-US"))}) > 0`);
  const filtered = `SELECT * FROM topik_app.preregistrations${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`;
  return {
    text: filters.deduplicate
      ? `WITH filtered AS (${filtered}), ranked AS (
           SELECT filtered.*,ROW_NUMBER() OVER (PARTITION BY email_normalized ORDER BY consented_at DESC,record_order DESC) AS email_rank
             FROM filtered
         ) SELECT * FROM ranked WHERE email_rank=1`
      : filtered,
    values,
  };
}

export class AdminPreregistrationRepository {
  async list(filters: PreregistrationFilters, paging: { page: number; pageSize: number }) {
    const query = buildPreregistrationQuery(filters);
    // The window count and rows share a snapshot; the fallback covers an empty last page.
    const rows = await pool.query(
      `SELECT registration_id AS "registrationId",email_original AS email,source,source_code AS "sourceCode",
              consented_at AS "consentedAt",locale,privacy_consent AS "privacyConsent",
              marketing_consent AS "marketingConsent",consent_version AS "consentVersion",COUNT(*) OVER()::int AS total
         FROM (${query.text}) registrations ORDER BY consented_at DESC,record_order DESC
         LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
      [...query.values, paging.pageSize, (paging.page - 1) * paging.pageSize],
    );
    const total = rows.rows[0]?.total ?? (await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM (${query.text}) registrations`, query.values,
    )).rows[0]?.total ?? 0;
    return { registrations: rows.rows.map(({ total: _total, ...row }) => row), total, ...paging };
  }

  csvStream(filters: PreregistrationFilters) {
    const query = buildPreregistrationQuery(filters);
    return createCsvStream(preregistrationColumns, {
      text: `${query.text} ORDER BY consented_at DESC,record_order DESC`, values: query.values,
    });
  }

  async delete(adminUserId: string, registrationId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const deleted = await client.query(
        "DELETE FROM topik_app.preregistrations WHERE registration_id=$1 RETURNING registration_id", [registrationId],
      );
      if (deleted.rowCount) {
        await client.query(
          "INSERT INTO topik_app.preregistration_deletion_audits(deleted_by,registration_id) VALUES ($1,$2)",
          [adminUserId, registrationId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
