-- Retry reusable exam-track binding repair while ignoring incidental whitespace
-- around standalone listening question prompts.
WITH latest_versions AS (
  SELECT qs.set_id,MAX(qsv.set_version)::integer AS set_version
    FROM topik_bank.question_sets qs
    JOIN topik_bank.question_set_versions qsv ON qsv.set_id=qs.set_id
   WHERE qs.section='listening'
   GROUP BY qs.set_id
), target_versions AS (
  SELECT set_id,set_version FROM latest_versions
  UNION
  SELECT mts.set_id,mts.set_version
    FROM topik_app.mock_test_sections mts
   WHERE mts.section='listening'
), group_snapshots AS (
  SELECT qsi.set_id,qsi.set_version,
         CASE WHEN LEFT(iv.item_type,7)='paired_' THEN iv.item_type
              ELSE 'position:' || qsi.position::text END AS audio_group_key,
         array_agg(qsi.position ORDER BY qsi.position) AS positions,
         jsonb_agg(jsonb_build_object(
           'position',qsi.position,
           'questionPrompt',CASE WHEN LEFT(iv.item_type,7)='paired_' THEN NULL
                                 ELSE BTRIM(COALESCE(iv.content_json->>'question_prompt','')) END,
           'dialogueTurns',COALESCE(iv.content_json->'dialogue_turns','[]'::jsonb)
         ) ORDER BY qsi.position) AS narration_signature,
         COUNT(binding.audio_asset_id)::integer AS current_binding_count,
         COUNT(asset.audio_asset_id) FILTER (
           WHERE asset.narration_version='exam_track_v4' AND asset.deleted_at IS NULL
         )::integer AS ready_binding_count,
         COUNT(*)::integer AS target_count,
         COUNT(DISTINCT asset.audio_asset_id) FILTER (
           WHERE asset.narration_version='exam_track_v4' AND asset.deleted_at IS NULL
         )::integer AS ready_asset_count
    FROM topik_bank.question_set_items qsi
    JOIN topik_bank.item_versions iv
      ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
    JOIN topik_bank.question_sets qs
      ON qs.set_id=qsi.set_id AND qs.section='listening'
    LEFT JOIN topik_app.question_set_item_audio_bindings binding
      ON binding.set_id=qsi.set_id AND binding.set_version=qsi.set_version
     AND binding.position=qsi.position AND binding.is_current
    LEFT JOIN topik_app.tts_audio_assets asset
      ON asset.audio_asset_id=binding.audio_asset_id
   WHERE iv.section='listening'
   GROUP BY qsi.set_id,qsi.set_version,
            CASE WHEN LEFT(iv.item_type,7)='paired_' THEN iv.item_type
                 ELSE 'position:' || qsi.position::text END
), repair_sources AS (
  SELECT target.set_id,target.set_version,target.audio_group_key,target.positions,
         source.set_version AS source_set_version
    FROM group_snapshots target
    JOIN target_versions selected
      ON selected.set_id=target.set_id AND selected.set_version=target.set_version
    JOIN LATERAL (
      SELECT previous.set_version
        FROM group_snapshots previous
       WHERE previous.set_id=target.set_id
         AND previous.set_version<target.set_version
         AND previous.audio_group_key=target.audio_group_key
         AND previous.positions=target.positions
         AND previous.narration_signature=target.narration_signature
         AND previous.ready_binding_count=previous.target_count
         AND previous.ready_asset_count=1
       ORDER BY previous.set_version DESC
       LIMIT 1
    ) source ON TRUE
   WHERE target.current_binding_count=0
)
INSERT INTO topik_app.question_set_item_audio_bindings(
  set_id,set_version,position,audio_asset_id,source_hash,is_current
)
SELECT repair.set_id,repair.set_version,source_binding.position,
       source_binding.audio_asset_id,source_binding.source_hash,TRUE
  FROM repair_sources repair
  JOIN topik_app.question_set_item_audio_bindings source_binding
    ON source_binding.set_id=repair.set_id
   AND source_binding.set_version=repair.source_set_version
   AND source_binding.position=ANY(repair.positions)
   AND source_binding.is_current
  JOIN topik_app.tts_audio_assets source_asset
    ON source_asset.audio_asset_id=source_binding.audio_asset_id
   AND source_asset.narration_version='exam_track_v4'
   AND source_asset.deleted_at IS NULL
ON CONFLICT DO NOTHING;
