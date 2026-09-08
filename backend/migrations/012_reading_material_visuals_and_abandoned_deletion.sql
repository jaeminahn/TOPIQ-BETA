ALTER TABLE topik_app.item_visual_assets
  ADD COLUMN IF NOT EXISTS visual_role TEXT NOT NULL DEFAULT 'choice';

ALTER TABLE topik_app.item_visual_assets
  DROP CONSTRAINT IF EXISTS item_visual_assets_visual_role_check;

ALTER TABLE topik_app.item_visual_assets
  ADD CONSTRAINT item_visual_assets_visual_role_check
    CHECK (visual_role IN ('choice', 'material'));

DROP INDEX IF EXISTS topik_app.item_visual_current_idx;
CREATE UNIQUE INDEX item_visual_current_idx
  ON topik_app.item_visual_assets(item_id, item_version, visual_role, option_number)
  WHERE is_current;

ALTER TABLE topik_app.visual_generation_jobs
  ADD COLUMN IF NOT EXISTS visual_role TEXT NOT NULL DEFAULT 'choice';

ALTER TABLE topik_app.visual_generation_jobs
  DROP CONSTRAINT IF EXISTS visual_generation_jobs_visual_role_check;

ALTER TABLE topik_app.visual_generation_jobs
  ADD CONSTRAINT visual_generation_jobs_visual_role_check
    CHECK (visual_role IN ('choice', 'material'));

DROP INDEX IF EXISTS topik_app.visual_generation_jobs_active_option_idx;
CREATE UNIQUE INDEX visual_generation_jobs_active_option_idx
  ON topik_app.visual_generation_jobs(item_id, item_version, visual_role, option_number)
  WHERE status IN ('queued', 'processing');

WITH reading_graphs AS (
  SELECT DISTINCT iv.item_id, iv.item_version,
         COALESCE(NULLIF(iv.content_json->>'passage', ''), iv.stem) AS source_text
    FROM topik_bank.question_set_items qsi
    JOIN topik_bank.item_versions iv
      ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
   WHERE iv.section='reading' AND qsi.position=10
)
UPDATE topik_bank.item_versions iv
   SET content_json=jsonb_set(
     COALESCE(iv.content_json, '{}'::jsonb),
     '{visual_material}',
     jsonb_build_object(
       'description', graph.source_text,
       'source_text', graph.source_text,
       'image_prompt', 'TOPIK II 읽기 10번용 흑백 통계 그래프를 만드세요. 제목, 모든 한국어 항목, 비율과 조사 대상을 다음 원문과 정확히 일치시키고 값을 추가·삭제·변경하지 마세요. 원문: ' || graph.source_text
     ),
     TRUE
   )
  FROM reading_graphs graph
 WHERE iv.item_id=graph.item_id AND iv.item_version=graph.item_version
   AND (jsonb_typeof(iv.content_json->'visual_material') IS DISTINCT FROM 'object');

ALTER TABLE topik_app.response_deletion_audits
  DROP CONSTRAINT IF EXISTS response_deletion_audits_deletion_scope_check;

ALTER TABLE topik_app.response_deletion_audits
  ADD CONSTRAINT response_deletion_audits_deletion_scope_check
    CHECK (deletion_scope IN ('selected_sessions', 'all_response_sessions', 'all_abandoned_sessions'));
