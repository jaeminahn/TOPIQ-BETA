import type { Pool, PoolClient } from "pg";

export async function readSurvey(db: Pick<Pool | PoolClient, "query">, sessionId: string) {
  const result = await db.query(
    `SELECT nationality_code AS "nationalityCode", birth_year AS "birthYear",
            topik_reasons AS "topikReasons", topik_reason_other AS "topikReasonOther",
            korean_study_duration AS "koreanStudyDuration", topik_experience AS "topikExperience",
            current_topik_level AS "currentTopikLevel", target_topik_level AS "targetTopikLevel",
            survey_version AS "surveyVersion", survey_completed_at AS "completedAt",
            survey_privacy_consent AS "privacyConsent",
            survey_privacy_consent_version AS "privacyConsentVersion",
            survey_privacy_consented_at AS "privacyConsentedAt"
       FROM topik_app.attempt_feedback WHERE session_id=$1 AND survey_completed_at IS NOT NULL`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}
