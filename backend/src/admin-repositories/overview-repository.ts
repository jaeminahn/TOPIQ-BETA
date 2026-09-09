import { pool } from "../db.js";

export class AdminOverviewRepository {
  async dashboard() {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(DISTINCT item_id) FROM topik_bank.item_versions)::int AS "totalItems",
        (SELECT COUNT(*) FROM topik_bank.item_versions)::int AS "totalVersions",
        (SELECT COUNT(*) FROM topik_bank.item_versions WHERE section='reading')::int AS "readingVersions",
        (SELECT COUNT(*) FROM topik_bank.item_versions WHERE section='listening')::int AS "listeningVersions",
        (SELECT COUNT(*) FROM topik_bank.question_sets)::int AS "setCount",
        (SELECT COUNT(*) FROM topik_app.mock_tests)::int AS "mockTestCount",
        (SELECT COUNT(*) FROM topik_app.mock_tests WHERE is_published)::int AS "publishedMockTests",
        (SELECT COUNT(*) FROM topik_app.question_set_item_audio_bindings binding
          JOIN topik_app.tts_audio_assets asset ON asset.audio_asset_id=binding.audio_asset_id
          WHERE binding.is_current AND asset.narration_version='exam_track_v4' AND asset.deleted_at IS NULL)::int AS "audioReady",
        ((SELECT COUNT(*) FROM topik_bank.question_set_items qsi
          JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE iv.section='listening')
          - (SELECT COUNT(*) FROM topik_app.question_set_item_audio_bindings binding
            JOIN topik_app.tts_audio_assets asset ON asset.audio_asset_id=binding.audio_asset_id
            WHERE binding.is_current AND asset.narration_version='exam_track_v4' AND asset.deleted_at IS NULL))::int AS "audioMissing",
        (SELECT COUNT(*) FROM topik_app.item_visual_assets WHERE is_current)::int AS "visualReady",
        ((SELECT COUNT(*) FROM topik_app.tts_generation_jobs WHERE status='queued')
          + (SELECT COUNT(*) FROM topik_app.visual_generation_jobs WHERE status='queued'))::int AS "jobsQueued",
        ((SELECT COUNT(*) FROM topik_app.tts_generation_jobs WHERE status='processing')
          + (SELECT COUNT(*) FROM topik_app.visual_generation_jobs WHERE status='processing'))::int AS "jobsProcessing",
        ((SELECT COUNT(*) FROM (
          SELECT DISTINCT ON (item_id,item_version) status
            FROM topik_app.tts_generation_jobs ORDER BY item_id,item_version,created_at DESC
        ) latest WHERE status='failed')
          + (SELECT COUNT(*) FROM (
            SELECT DISTINCT ON (item_id,item_version,visual_role,option_number) status
              FROM topik_app.visual_generation_jobs ORDER BY item_id,item_version,visual_role,option_number,created_at DESC
          ) latest_visual WHERE status='failed'))::int AS "jobsFailed",
        (SELECT COUNT(*) FROM topik_app.sessions WHERE started_at::date=CURRENT_DATE)::int AS "sessionsToday",
        (SELECT COUNT(*) FROM topik_app.response_observations)::int AS "responseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NOT NULL)::int AS "answeredResponseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NULL)::int AS "unansweredResponseCount"`,
    );
    return result.rows[0];
  }

  async listJobs(limit = 100) {
    const result = await pool.query(
      `SELECT job_id AS "jobId", item_id AS "itemId", item_version AS "itemVersion",
              status, attempts, error_message AS "errorMessage", audio_asset_id AS "audioAssetId",
              created_at AS "createdAt", completed_at AS "completedAt"
         FROM topik_app.tts_generation_jobs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }
}
