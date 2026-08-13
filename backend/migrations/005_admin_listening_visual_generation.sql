CREATE TABLE IF NOT EXISTS topik_app.visual_generation_jobs (
    job_id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    option_number SMALLINT NOT NULL CHECK (option_number BETWEEN 1 AND 4),
    requested_by UUID NOT NULL REFERENCES topik_app.admin_users(admin_user_id),
    force_regenerate BOOLEAN NOT NULL DEFAULT FALSE,
    provider TEXT NOT NULL DEFAULT 'google-vertex',
    model_name TEXT NOT NULL,
    prompt_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
    attempts SMALLINT NOT NULL DEFAULT 0,
    error_message TEXT,
    visual_asset_id UUID REFERENCES topik_app.item_visual_assets(visual_asset_id) ON DELETE SET NULL,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);

CREATE INDEX IF NOT EXISTS visual_generation_jobs_worker_idx
    ON topik_app.visual_generation_jobs(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS visual_generation_jobs_active_option_idx
    ON topik_app.visual_generation_jobs(item_id, item_version, option_number)
    WHERE status IN ('queued', 'processing');
