import { pool } from "../../core/db.js";
import { emailUsageRepository } from "../../email/usage-repository.js";

export class AdminOverviewRepository {
  async dashboard() {
    const [result, emailUsage] = await Promise.all([pool.query(
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
        (SELECT COUNT(*) FROM topik_app.sessions WHERE started_at::date=CURRENT_DATE)::int AS "sessionsToday",
        (SELECT COUNT(*) FROM topik_app.response_observations)::int AS "responseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NOT NULL)::int AS "answeredResponseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NULL)::int AS "unansweredResponseCount"`,
    ), emailUsageRepository.getSummary()]);
    return { ...result.rows[0], emailUsage };
  }

  async setResultEmailEnabled(adminUserId: string, enabled: boolean) {
    return emailUsageRepository.setEnabled(adminUserId, enabled);
  }

}
