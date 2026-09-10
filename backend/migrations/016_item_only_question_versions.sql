LOCK TABLE topik_bank.question_set_versions,
           topik_bank.question_set_items,
           topik_app.mock_test_sections,
           topik_app.session_items,
           topik_app.question_set_item_audio_bindings,
           topik_app.tts_generation_jobs,
           topik_app.tts_generation_job_targets
    IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE latest_question_set_versions ON COMMIT DROP AS
SELECT DISTINCT ON (set_id)
       set_id,
       set_version,
       review_status,
       default_target_level,
       default_predicted_difficulty,
       set_fingerprint,
       published_at
  FROM topik_bank.question_set_versions
 ORDER BY set_id, set_version DESC;

CREATE UNIQUE INDEX latest_question_set_versions_set_id_idx
    ON latest_question_set_versions(set_id);

CREATE TEMP TABLE migrated_question_set_audio_bindings ON COMMIT DROP AS
WITH ranked AS (
  SELECT binding.set_id,
         binding.position,
         binding.audio_asset_id,
         binding.source_hash,
         binding.created_at,
         BOOL_OR(binding.is_current AND binding.set_version=latest.set_version)
           OVER (PARTITION BY binding.set_id,binding.position,binding.audio_asset_id) AS is_current,
         ROW_NUMBER() OVER (
           PARTITION BY binding.set_id,binding.position,binding.audio_asset_id
           ORDER BY (binding.set_version=latest.set_version) DESC,
                    binding.set_version DESC,
                    binding.created_at DESC
         ) AS row_number
    FROM topik_app.question_set_item_audio_bindings binding
    JOIN latest_question_set_versions latest ON latest.set_id=binding.set_id
)
SELECT set_id,position,audio_asset_id,source_hash,is_current,created_at
  FROM ranked
 WHERE row_number=1;

ALTER TABLE topik_bank.question_sets
    ADD COLUMN review_status TEXT,
    ADD COLUMN default_target_level SMALLINT,
    ADD COLUMN default_predicted_difficulty DOUBLE PRECISION,
    ADD COLUMN set_fingerprint CHAR(64),
    ADD COLUMN published_at TIMESTAMPTZ;

UPDATE topik_bank.question_sets question_set
   SET review_status=latest.review_status,
       default_target_level=latest.default_target_level,
       default_predicted_difficulty=latest.default_predicted_difficulty,
       set_fingerprint=latest.set_fingerprint,
       published_at=latest.published_at
  FROM latest_question_set_versions latest
 WHERE latest.set_id=question_set.set_id;

ALTER TABLE topik_bank.question_sets
    ALTER COLUMN review_status SET DEFAULT 'reviewed',
    ALTER COLUMN review_status SET NOT NULL,
    ALTER COLUMN default_target_level SET NOT NULL,
    ALTER COLUMN default_predicted_difficulty SET NOT NULL,
    ALTER COLUMN set_fingerprint SET NOT NULL,
    ALTER COLUMN published_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN published_at SET NOT NULL,
    ADD CONSTRAINT question_sets_review_status_check
      CHECK (review_status IN ('reviewed','pilot','active','retired')),
    ADD CONSTRAINT question_sets_default_target_level_check
      CHECK (default_target_level BETWEEN 1 AND 6),
    ADD CONSTRAINT question_sets_default_predicted_difficulty_check
      CHECK (default_predicted_difficulty BETWEEN -3.0 AND 3.0);

UPDATE topik_app.mock_tests mock_test
   SET is_published=FALSE,
       updated_at=CURRENT_TIMESTAMP
 WHERE is_published
   AND EXISTS (
     SELECT 1
       FROM topik_app.mock_test_sections section
       JOIN latest_question_set_versions latest ON latest.set_id=section.set_id
      WHERE section.mock_test_id=mock_test.mock_test_id
        AND section.set_version<>latest.set_version
   );

UPDATE topik_app.tts_generation_jobs
   SET status='failed',
       error_message=CASE
         WHEN COALESCE(error_message,'')='' THEN 'Cancelled during item-only question version migration'
         ELSE error_message || '; Cancelled during item-only question version migration'
       END,
       completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),
       lease_expires_at=NULL
 WHERE set_id IS NOT NULL
   AND status IN ('queued','processing');

DROP VIEW topik_bank.current_set_contents;

ALTER TABLE topik_app.question_set_item_audio_bindings
    DROP CONSTRAINT question_set_item_audio_bindin_set_id_set_version_position_fkey,
    DROP CONSTRAINT question_set_item_audio_bindings_pkey,
    DROP CONSTRAINT question_set_item_audio_bindings_set_version_check;
DROP INDEX topik_app.question_set_item_audio_current_idx;

ALTER TABLE topik_app.tts_generation_job_targets
    DROP CONSTRAINT tts_generation_job_targets_set_item_fkey,
    DROP CONSTRAINT tts_generation_job_targets_set_fields_check;

ALTER TABLE topik_app.mock_test_sections
    DROP CONSTRAINT mock_test_sections_set_id_set_version_fkey,
    DROP CONSTRAINT mock_test_sections_mock_test_id_set_id_set_version_key,
    DROP CONSTRAINT mock_test_sections_set_version_check;

ALTER TABLE topik_app.session_items
    DROP CONSTRAINT session_items_set_id_set_version_fkey,
    DROP CONSTRAINT session_items_session_id_set_id_set_version_test_position_key,
    DROP CONSTRAINT session_items_set_version_check;

ALTER TABLE topik_app.tts_generation_jobs
    DROP CONSTRAINT tts_generation_jobs_set_fkey,
    DROP CONSTRAINT tts_generation_jobs_exam_track_fields_check,
    DROP CONSTRAINT tts_generation_jobs_set_version_check;
DROP INDEX topik_app.tts_jobs_active_group_idx;

ALTER TABLE topik_bank.question_set_items
    DROP CONSTRAINT question_set_items_set_id_set_version_fkey,
    DROP CONSTRAINT question_set_items_pkey,
    DROP CONSTRAINT question_set_items_set_id_set_version_item_id_key;

TRUNCATE topik_app.question_set_item_audio_bindings;

DELETE FROM topik_bank.question_set_items member
 USING latest_question_set_versions latest
 WHERE member.set_id=latest.set_id
   AND member.set_version<>latest.set_version;

ALTER TABLE topik_bank.question_set_items
    DROP COLUMN set_version,
    ADD CONSTRAINT question_set_items_pkey PRIMARY KEY (set_id,position),
    ADD CONSTRAINT question_set_items_set_id_item_id_key UNIQUE (set_id,item_id),
    ADD CONSTRAINT question_set_items_set_id_fkey
      FOREIGN KEY (set_id) REFERENCES topik_bank.question_sets(set_id);

ALTER TABLE topik_app.mock_test_sections
    DROP COLUMN set_version,
    ADD CONSTRAINT mock_test_sections_mock_test_id_set_id_key UNIQUE (mock_test_id,set_id),
    ADD CONSTRAINT mock_test_sections_set_id_fkey
      FOREIGN KEY (set_id) REFERENCES topik_bank.question_sets(set_id);

ALTER TABLE topik_app.session_items
    DROP COLUMN set_version,
    ADD CONSTRAINT session_items_session_id_set_id_test_position_key
      UNIQUE (session_id,set_id,test_position),
    ADD CONSTRAINT session_items_set_id_fkey
      FOREIGN KEY (set_id) REFERENCES topik_bank.question_sets(set_id);

ALTER TABLE topik_app.question_set_item_audio_bindings
    DROP COLUMN set_version,
    ADD CONSTRAINT question_set_item_audio_bindings_pkey
      PRIMARY KEY (set_id,position,audio_asset_id),
    ADD CONSTRAINT question_set_item_audio_bindings_set_item_fkey
      FOREIGN KEY (set_id,position)
      REFERENCES topik_bank.question_set_items(set_id,position);

INSERT INTO topik_app.question_set_item_audio_bindings(
  set_id,position,audio_asset_id,source_hash,is_current,created_at
)
SELECT set_id,position,audio_asset_id,source_hash,is_current,created_at
  FROM migrated_question_set_audio_bindings;

CREATE UNIQUE INDEX question_set_item_audio_current_idx
    ON topik_app.question_set_item_audio_bindings(set_id,position)
    WHERE is_current;

ALTER TABLE topik_app.tts_generation_jobs
    DROP COLUMN set_version,
    ADD CONSTRAINT tts_generation_jobs_exam_track_fields_check
      CHECK (
        (set_id IS NULL AND group_start_position IS NULL AND script_snapshot IS NULL)
        OR
        (set_id IS NOT NULL AND group_start_position IS NOT NULL AND script_snapshot IS NOT NULL)
      ),
    ADD CONSTRAINT tts_generation_jobs_set_fkey
      FOREIGN KEY (set_id) REFERENCES topik_bank.question_sets(set_id);

CREATE UNIQUE INDEX tts_jobs_active_group_idx
    ON topik_app.tts_generation_jobs(set_id,group_start_position)
    WHERE status IN ('queued','processing') AND set_id IS NOT NULL;

ALTER TABLE topik_app.tts_generation_job_targets
    DROP COLUMN set_version,
    ADD CONSTRAINT tts_generation_job_targets_set_fields_check
      CHECK (
        (set_id IS NULL AND position IS NULL)
        OR
        (set_id IS NOT NULL AND position IS NOT NULL)
      ),
    ADD CONSTRAINT tts_generation_job_targets_set_item_fkey
      FOREIGN KEY (set_id,position)
      REFERENCES topik_bank.question_set_items(set_id,position);

DROP TABLE topik_bank.question_set_versions;

CREATE VIEW topik_bank.current_set_contents AS
SELECT question_set.set_id,
       question_set.section AS set_section,
       question_set.generator_provider AS set_generator_provider,
       question_set.generator_model AS set_generator_model,
       question_set.generator_version AS set_generator_version,
       question_set.review_status AS set_review_status,
       question_set.default_target_level,
       question_set.default_predicted_difficulty,
       question_set.published_at,
       member.position,
       item.source_key,
       version.item_id,
       version.item_version,
       version.type_slot,
       version.item_type,
       version.primary_skill,
       version.target_level,
       version.predicted_difficulty,
       version.irt_difficulty,
       version.irt_discrimination,
       version.review_status AS item_review_status,
       version.stem,
       version.choices,
       version.correct_answer,
       version.explanation,
       version.content_json,
       version.source_provenance,
       question_set.set_sequence
  FROM topik_bank.question_sets question_set
  JOIN topik_bank.question_set_items member ON member.set_id=question_set.set_id
  JOIN topik_bank.items item ON item.item_id=member.item_id
  JOIN topik_bank.item_versions version
    ON version.item_id=member.item_id AND version.item_version=member.item_version;
