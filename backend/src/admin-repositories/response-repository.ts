import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { sanitizeQuestion } from "../domain.js";
import { AppError, notFound } from "../errors.js";
import { AdminReadingRepository } from "./reading-repository.js";

export class AdminResponseRepository extends AdminReadingRepository {
  async listResponseSessions(input: {
    section?: "reading" | "listening";
    correctness?: "correct" | "incorrect" | "unanswered";
    status?: "submitted" | "abandoned";
    page: number;
    pageSize: number;
  }) {
    const values: unknown[] = [];
    const filters: string[] = ["s.status IN ('submitted','abandoned')"];
    if (input.status) { values.push(input.status); filters.push(`s.status=$${values.length}`); }
    if (input.section) {
      values.push(input.section);
      filters.push(`EXISTS (SELECT 1 FROM topik_app.session_items sx WHERE sx.session_id=s.session_id AND sx.section=$${values.length})`);
    }
    if (input.correctness === "correct") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.is_correct=TRUE)");
    if (input.correctness === "incorrect") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.is_correct=FALSE AND rx.selected_option IS NOT NULL)");
    if (input.correctness === "unanswered") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.selected_option IS NULL)");
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitParam = values.length - 1;
    const offsetParam = values.length;
    const result = await pool.query(
      `SELECT COUNT(*) OVER()::int AS "totalCount", s.session_id AS "sessionId",
              s.user_id AS "userId", mt.title_ko AS "mockTestTitle", s.mode, s.status,
              s.started_at AS "startedAt", s.submitted_at AS "submittedAt",
              s.abandoned_at AS "abandonedAt", s.score,
              s.max_score AS "maxScore", af.rating,
              MIN(si.section) AS section,
              COUNT(si.item_order)::int AS "responseCount",
              COUNT(a.item_order)::int AS "answeredCount",
              (COUNT(si.item_order)-COUNT(a.item_order))::int AS "unansweredCount",
              COUNT(ro.observation_id) FILTER (WHERE ro.is_correct)::int AS "correctCount",
              COUNT(ro.observation_id) FILTER (WHERE NOT ro.is_correct AND ro.selected_option IS NOT NULL)::int AS "incorrectCount",
              email_state.result_email AS "resultEmail"
         FROM topik_app.sessions s
         JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
         LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
         JOIN topik_app.session_items si ON si.session_id=s.session_id
         LEFT JOIN topik_app.response_observations ro ON ro.session_id=s.session_id AND ro.item_order=si.item_order
         LEFT JOIN topik_app.answer_states a ON a.session_id=s.session_id AND a.item_order=si.item_order
         LEFT JOIN LATERAL (
           SELECT red.email_original AS result_email
             FROM topik_app.result_email_deliveries red
            WHERE red.session_id=s.session_id
              AND red.status='accepted'
              AND red.revoked_at IS NULL
            ORDER BY red.accepted_at DESC NULLS LAST,red.requested_at DESC
            LIMIT 1
         ) email_state ON TRUE
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        GROUP BY s.session_id,mt.title_ko,af.rating,email_state.result_email
        ORDER BY COALESCE(s.submitted_at,s.abandoned_at) DESC NULLS LAST
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      values,
    );
    return { sessions: result.rows, total: result.rows[0]?.totalCount ?? 0 };
  }

  async getResponseSession(sessionId: string) {
    const result = await pool.query(
      `SELECT ro.observation_id AS "observationId", ro.user_id AS "userId",
              ro.session_id AS "sessionId", ro.item_id AS "itemId",
              ro.item_version AS "itemVersion", ro.item_order AS "itemOrder",
              si.section, si.test_position AS "testPosition", mt.title_ko AS "mockTestTitle",
              iv.item_type AS "itemType", ro.selected_option AS "selectedOption",
              iv.correct_answer AS "correctAnswer", ro.is_correct AS "isCorrect",
              ro.response_time_ms AS "responseTimeMs", ro.skipped, ro.timed_out AS "timedOut",
              ro.answer_changed AS "answerChanged", ro.policy_version AS "policyVersion",
              ro.created_at AS "createdAt", s.mode, s.score, af.rating,
              iv.stem AS "questionStem", iv.choices AS "questionChoices",
              iv.content_json AS "questionContent", iv.explanation,
              COALESCE(set_asset.audio_asset_id,legacy_asset.audio_asset_id) AS "audioAssetId",
              CASE WHEN set_asset.narration_version IN ('exam_track_v2','exam_track_v3','exam_track_v4') THEN 1
                   ELSE GREATEST(1,COALESCE((iv.content_json->>'repeat_count')::int,1)) END AS "audioRepeatCount",
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'number', iva.option_number, 'imageUrl', iva.storage_url
              ) ORDER BY iva.option_number)
                FROM topik_app.item_visual_assets iva
               WHERE iva.item_id=ro.item_id AND iva.item_version=ro.item_version
                 AND iva.visual_role='choice' AND iva.is_current), '[]'::jsonb) AS "visualAssets",
              (SELECT jsonb_build_object(
                'imageUrl',iva.storage_url,
                'description',COALESCE(iv.content_json->'visual_material'->>'description',iv.content_json->>'passage','읽기 10번 그래프')
              ) FROM topik_app.item_visual_assets iva
                WHERE iva.item_id=ro.item_id AND iva.item_version=ro.item_version
                  AND iva.visual_role='material' AND iva.option_number=1 AND iva.is_current
                LIMIT 1) AS "materialVisual"
         FROM topik_app.response_observations ro
         JOIN topik_app.session_items si ON si.session_id=ro.session_id AND si.item_order=ro.item_order
         JOIN topik_bank.item_versions iv ON iv.item_id=ro.item_id AND iv.item_version=ro.item_version
         JOIN topik_app.sessions s ON s.session_id=ro.session_id
         JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
         LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
         LEFT JOIN topik_app.question_set_item_audio_bindings set_binding
           ON set_binding.set_id=si.set_id AND set_binding.set_version=si.set_version
          AND set_binding.position=si.test_position AND set_binding.is_current
         LEFT JOIN topik_app.tts_audio_assets set_asset
           ON set_asset.audio_asset_id=set_binding.audio_asset_id AND set_asset.deleted_at IS NULL
         LEFT JOIN topik_app.item_audio_bindings legacy_binding
           ON legacy_binding.item_id=ro.item_id AND legacy_binding.item_version=ro.item_version
          AND legacy_binding.is_current AND set_asset.audio_asset_id IS NULL
         LEFT JOIN topik_app.tts_audio_assets legacy_asset
           ON legacy_asset.audio_asset_id=legacy_binding.audio_asset_id AND legacy_asset.deleted_at IS NULL
        WHERE ro.session_id=$1 ORDER BY ro.item_order`,
      [sessionId],
    );
    if (!result.rowCount) throw notFound("Response session not found");
    return {
      responses: result.rows.map((row) => {
        const {
          questionStem,
          questionChoices,
          questionContent,
          audioAssetId,
          audioRepeatCount,
          visualAssets,
          materialVisual,
          ...response
        } = row;
        return {
          ...response,
          explanation: typeof row.explanation === "string" ? row.explanation : "",
          question: sanitizeQuestion({
            item_order: row.itemOrder,
            section: row.section,
            test_position: row.testPosition,
            item_id: row.itemId,
            item_version: row.itemVersion,
            item_type: row.itemType,
            stem: questionStem,
            choices: questionChoices,
            content_json: questionContent,
            audio_asset_id: audioAssetId,
            audio_repeat_count: audioRepeatCount,
            visual_assets: visualAssets,
            material_visual: materialVisual,
            selected_option: row.selectedOption,
          }, { includeTranscript: true }),
        };
      }),
    };
  }

  async deleteResponseSessions(adminUserId: string, sessionIds: string[] | "all" | "abandoned") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = sessionIds === "all"
        ? await client.query<{ session_id: string; user_id: string }>(
            `SELECT s.session_id,s.user_id FROM topik_app.sessions s
              WHERE s.status='submitted' AND EXISTS (
                SELECT 1 FROM topik_app.response_observations ro WHERE ro.session_id=s.session_id
              ) FOR UPDATE`,
          )
        : sessionIds === "abandoned"
          ? await client.query<{ session_id: string; user_id: string }>(
              `SELECT s.session_id,s.user_id FROM topik_app.sessions s
                WHERE s.status='abandoned' FOR UPDATE`,
            )
        : await client.query<{ session_id: string; user_id: string }>(
            `SELECT s.session_id,s.user_id FROM topik_app.sessions s
              WHERE s.session_id=ANY($1::uuid[]) AND s.status IN ('submitted','abandoned') FOR UPDATE`,
            [sessionIds],
          );
      if (Array.isArray(sessionIds) && selected.rowCount !== new Set(sessionIds).size) {
        throw new AppError(409, "RESPONSE_SESSION_INVALID", "One or more response sessions cannot be deleted");
      }
      const ids = selected.rows.map((row) => row.session_id);
      const userIds = selected.rows.map((row) => row.user_id);
      const observations = ids.length
        ? await client.query("DELETE FROM topik_app.response_observations WHERE session_id=ANY($1::uuid[]) RETURNING observation_id", [ids])
        : { rowCount: 0 };
      if (ids.length) {
        await client.query("DELETE FROM topik_app.sessions WHERE session_id=ANY($1::uuid[])", [ids]);
        await client.query(
          `DELETE FROM topik_app.users u WHERE u.user_id=ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM topik_app.sessions s WHERE s.user_id=u.user_id)`,
          [userIds],
        );
      }
      await client.query(
        `INSERT INTO topik_app.response_deletion_audits(
           deletion_audit_id,deleted_by,deletion_scope,deleted_session_count,deleted_observation_count
         ) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), adminUserId,
          sessionIds === "all" ? "all_response_sessions" : sessionIds === "abandoned" ? "all_abandoned_sessions" : "selected_sessions",
          ids.length, observations.rowCount ?? 0],
      );
      await client.query("COMMIT");
      return { deletedSessions: ids.length, deletedObservations: observations.rowCount ?? 0 };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
