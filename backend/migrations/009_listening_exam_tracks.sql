ALTER TABLE topik_app.tts_audio_assets
    ADD COLUMN IF NOT EXISTS narration_version TEXT NOT NULL DEFAULT 'dialogue_v1',
    ADD COLUMN IF NOT EXISTS script_snapshot JSONB;

ALTER TABLE topik_app.tts_audio_assets
    DROP CONSTRAINT IF EXISTS tts_audio_assets_narration_version_check;
ALTER TABLE topik_app.tts_audio_assets
    ADD CONSTRAINT tts_audio_assets_narration_version_check
    CHECK (narration_version IN ('dialogue_v1', 'exam_track_v2'));
ALTER TABLE topik_app.tts_audio_assets
    DROP CONSTRAINT IF EXISTS tts_audio_assets_script_snapshot_check;
ALTER TABLE topik_app.tts_audio_assets
    ADD CONSTRAINT tts_audio_assets_script_snapshot_check
    CHECK (narration_version='dialogue_v1' OR script_snapshot IS NOT NULL);

ALTER TABLE topik_app.tts_generation_jobs
    ADD COLUMN IF NOT EXISTS set_id UUID,
    ADD COLUMN IF NOT EXISTS set_version INTEGER,
    ADD COLUMN IF NOT EXISTS group_start_position SMALLINT,
    ADD COLUMN IF NOT EXISTS script_snapshot JSONB;

ALTER TABLE topik_app.tts_generation_jobs
    DROP CONSTRAINT IF EXISTS tts_generation_jobs_set_version_check;
ALTER TABLE topik_app.tts_generation_jobs
    ADD CONSTRAINT tts_generation_jobs_set_version_check
    CHECK (set_version IS NULL OR set_version > 0);
ALTER TABLE topik_app.tts_generation_jobs
    DROP CONSTRAINT IF EXISTS tts_generation_jobs_group_start_position_check;
ALTER TABLE topik_app.tts_generation_jobs
    ADD CONSTRAINT tts_generation_jobs_group_start_position_check
    CHECK (group_start_position IS NULL OR group_start_position > 0);
ALTER TABLE topik_app.tts_generation_jobs
    DROP CONSTRAINT IF EXISTS tts_generation_jobs_exam_track_fields_check;
ALTER TABLE topik_app.tts_generation_jobs
    ADD CONSTRAINT tts_generation_jobs_exam_track_fields_check
    CHECK (
        (set_id IS NULL AND set_version IS NULL AND group_start_position IS NULL AND script_snapshot IS NULL)
        OR
        (set_id IS NOT NULL AND set_version IS NOT NULL AND group_start_position IS NOT NULL AND script_snapshot IS NOT NULL)
    );
ALTER TABLE topik_app.tts_generation_jobs
    DROP CONSTRAINT IF EXISTS tts_generation_jobs_set_fkey;
ALTER TABLE topik_app.tts_generation_jobs
    ADD CONSTRAINT tts_generation_jobs_set_fkey
    FOREIGN KEY (set_id, set_version)
    REFERENCES topik_bank.question_set_versions(set_id, set_version);

ALTER TABLE topik_app.tts_generation_job_targets
    ADD COLUMN IF NOT EXISTS set_id UUID,
    ADD COLUMN IF NOT EXISTS set_version INTEGER,
    ADD COLUMN IF NOT EXISTS position SMALLINT;

ALTER TABLE topik_app.tts_generation_job_targets
    DROP CONSTRAINT IF EXISTS tts_generation_job_targets_position_check;
ALTER TABLE topik_app.tts_generation_job_targets
    ADD CONSTRAINT tts_generation_job_targets_position_check
    CHECK (position IS NULL OR position > 0);
ALTER TABLE topik_app.tts_generation_job_targets
    DROP CONSTRAINT IF EXISTS tts_generation_job_targets_set_fields_check;
ALTER TABLE topik_app.tts_generation_job_targets
    ADD CONSTRAINT tts_generation_job_targets_set_fields_check
    CHECK (
        (set_id IS NULL AND set_version IS NULL AND position IS NULL)
        OR
        (set_id IS NOT NULL AND set_version IS NOT NULL AND position IS NOT NULL)
    );
ALTER TABLE topik_app.tts_generation_job_targets
    DROP CONSTRAINT IF EXISTS tts_generation_job_targets_set_item_fkey;
ALTER TABLE topik_app.tts_generation_job_targets
    ADD CONSTRAINT tts_generation_job_targets_set_item_fkey
    FOREIGN KEY (set_id, set_version, position)
    REFERENCES topik_bank.question_set_items(set_id, set_version, position);

DROP INDEX IF EXISTS topik_app.tts_jobs_active_item_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tts_jobs_active_group_idx
    ON topik_app.tts_generation_jobs(set_id, set_version, group_start_position)
    WHERE status IN ('queued', 'processing') AND set_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tts_jobs_active_legacy_item_idx
    ON topik_app.tts_generation_jobs(item_id, item_version)
    WHERE status IN ('queued', 'processing') AND set_id IS NULL;

CREATE TABLE IF NOT EXISTS topik_app.question_set_item_audio_bindings (
    set_id UUID NOT NULL,
    set_version INTEGER NOT NULL CHECK (set_version > 0),
    position SMALLINT NOT NULL CHECK (position > 0),
    audio_asset_id UUID NOT NULL REFERENCES topik_app.tts_audio_assets(audio_asset_id),
    source_hash CHAR(64) NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (set_id, set_version, position, audio_asset_id),
    FOREIGN KEY (set_id, set_version, position)
        REFERENCES topik_bank.question_set_items(set_id, set_version, position)
);

CREATE UNIQUE INDEX IF NOT EXISTS question_set_item_audio_current_idx
    ON topik_app.question_set_item_audio_bindings(set_id, set_version, position)
    WHERE is_current;
CREATE INDEX IF NOT EXISTS question_set_item_audio_asset_idx
    ON topik_app.question_set_item_audio_bindings(audio_asset_id, is_current);
