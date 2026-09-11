CREATE TABLE IF NOT EXISTS topik_app.email_settings (
    settings_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
    result_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES topik_app.admin_users(admin_user_id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO topik_app.email_settings(settings_id, result_email_enabled)
VALUES (1, TRUE)
ON CONFLICT (settings_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS topik_app.email_send_ledger (
    send_id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('result', 'quota_warning')),
    result_delivery_id UUID UNIQUE
        REFERENCES topik_app.result_email_deliveries(delivery_id) ON DELETE SET NULL,
    trigger_delivery_id UUID
        REFERENCES topik_app.result_email_deliveries(delivery_id) ON DELETE SET NULL,
    session_id UUID REFERENCES topik_app.sessions(session_id) ON DELETE SET NULL,
    billing_cycle_start DATE NOT NULL,
    recipient_count SMALLINT NOT NULL CHECK (recipient_count > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'accepted', 'failed')),
    provider_message_ids TEXT[] NOT NULL DEFAULT '{}',
    failure_code TEXT,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_expires_at TIMESTAMPTZ,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    CHECK (
        (kind = 'result' AND recipient_count = 1)
        OR (kind = 'quota_warning' AND recipient_count = 2)
    )
);

CREATE INDEX IF NOT EXISTS email_send_ledger_cycle_status_idx
    ON topik_app.email_send_ledger(billing_cycle_start, status, requested_at);

CREATE INDEX IF NOT EXISTS email_send_ledger_session_window_idx
    ON topik_app.email_send_ledger(session_id, requested_at DESC)
    WHERE kind = 'result' AND status IN ('pending', 'processing', 'accepted');

CREATE UNIQUE INDEX IF NOT EXISTS email_send_ledger_cycle_warning_idx
    ON topik_app.email_send_ledger(billing_cycle_start)
    WHERE kind = 'quota_warning' AND status IN ('pending', 'processing', 'accepted');

INSERT INTO topik_app.email_send_ledger(
    send_id, kind, result_delivery_id, session_id, billing_cycle_start,
    recipient_count, status, provider_message_ids, failure_code,
    requested_at, accepted_at, failed_at
)
SELECT delivery.delivery_id,
       'result',
       delivery.delivery_id,
       delivery.session_id,
       (date_trunc(
           'month',
           delivery.requested_at AT TIME ZONE 'Asia/Seoul' - INTERVAL '10 days'
        ) + INTERVAL '10 days')::date,
       1,
       delivery.status,
       CASE WHEN delivery.provider_message_id IS NULL
            THEN '{}'::text[] ELSE ARRAY[delivery.provider_message_id] END,
       delivery.failure_code,
       delivery.requested_at,
       delivery.accepted_at,
       delivery.failed_at
  FROM topik_app.result_email_deliveries delivery
 WHERE delivery.requested_at >= TIMESTAMPTZ '2026-09-11 00:00:00+09'
ON CONFLICT (send_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS topik_app.media_cleanup_jobs (
    cleanup_job_id UUID PRIMARY KEY,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('visual', 'audio')),
    asset_id UUID NOT NULL,
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'waiting', 'failed')),
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error_message TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS media_cleanup_jobs_active_asset_idx
    ON topik_app.media_cleanup_jobs(asset_type, asset_id)
    WHERE status IN ('queued', 'processing', 'waiting');

CREATE INDEX IF NOT EXISTS media_cleanup_jobs_worker_idx
    ON topik_app.media_cleanup_jobs(status, next_attempt_at, created_at);

INSERT INTO topik_app.media_cleanup_jobs(
    cleanup_job_id, asset_type, asset_id, storage_bucket, storage_path
)
SELECT visual_asset_id, 'visual', visual_asset_id, storage_bucket, storage_path
  FROM topik_app.item_visual_assets
 WHERE NOT is_current
ON CONFLICT DO NOTHING;

INSERT INTO topik_app.media_cleanup_jobs(
    cleanup_job_id, asset_type, asset_id, storage_bucket, storage_path
)
SELECT audio.audio_asset_id, 'audio', audio.audio_asset_id,
       audio.storage_bucket, audio.storage_path
  FROM topik_app.tts_audio_assets audio
 WHERE audio.deleted_at IS NULL
   AND audio.storage_url <> ''
   AND NOT EXISTS (
       SELECT 1 FROM topik_app.item_audio_bindings binding
        WHERE binding.audio_asset_id = audio.audio_asset_id AND binding.is_current
   )
   AND NOT EXISTS (
       SELECT 1 FROM topik_app.question_set_item_audio_bindings binding
        WHERE binding.audio_asset_id = audio.audio_asset_id AND binding.is_current
   )
ON CONFLICT DO NOTHING;
