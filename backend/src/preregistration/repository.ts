import type { PoolClient } from "pg";
import { pool } from "../core/db.js";
import { AppError } from "../core/errors.js";

export const preregistrationConsentVersion = "preregistration_v1";
export type PreregistrationInput = {
  email: string;
  locale: "ko" | "en";
  requestId: string;
  consentVersion: typeof preregistrationConsentVersion;
};

export async function insertPreregistration(
  client: Pick<PoolClient, "query">,
  input: PreregistrationInput & { source: "landing" | "topik_result" | "marathon"; sessionId?: string; marathonSessionId?: string },
) {
  const recipient = input.email.trim();
  const normalized = recipient.toLocaleLowerCase("en-US");
  const marathon = input.source === "marathon";
  const result = await client.query<{ registrationId: string }>(
    `INSERT INTO topik_app.preregistrations(
       source, source_code, sequence_number, request_id, email_original, email_normalized,
       locale, privacy_consent, marketing_consent, consent_version, ${marathon ? 'marathon_session_id' : 'session_id'}
     ) VALUES ($1, CASE WHEN $1='landing' THEN '001' WHEN $1='marathon' THEN '003' ELSE '002' END,
       CASE WHEN $1='landing' THEN nextval('topik_app.preregistration_landing_seq')
            ${marathon ? "WHEN $1='marathon' THEN nextval('topik_app.preregistration_marathon_seq')" : ''}
            ELSE nextval('topik_app.preregistration_topik_seq') END,
       $2,$3,$4,$5,TRUE,TRUE,$6,$7)
     ON CONFLICT (request_id) DO NOTHING
     RETURNING registration_id AS "registrationId"`,
    [input.source, input.requestId, recipient, normalized, input.locale, input.consentVersion, input.marathonSessionId ?? input.sessionId ?? null],
  );
  if (result.rows[0]) return result.rows[0];
  // A separate statement sees a concurrent insertion after ON CONFLICT waits for it.
  const previous = await client.query<{
    registrationId: string; source: string; email_normalized: string;
    locale: string; consent_version: string; session_id: string | null;
  }>(
    `SELECT registration_id AS "registrationId",source,email_normalized,locale,consent_version,${marathon ? 'marathon_session_id' : 'session_id'} AS session_id
       FROM topik_app.preregistrations WHERE request_id=$1`,
    [input.requestId],
  );
  const row = previous.rows[0];
  if (!row || row.source !== input.source || row.email_normalized !== normalized || row.locale !== input.locale
      || row.consent_version !== input.consentVersion || row.session_id !== (input.marathonSessionId ?? input.sessionId ?? null)) {
    throw new AppError(409, "PREREGISTRATION_REQUEST_CONFLICT", "This request ID belongs to a different application");
  }
  return { registrationId: row.registrationId };
}

export class PreregistrationRepository {
  async registerLanding(input: PreregistrationInput) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await insertPreregistration(client, { ...input, source: "landing" });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
