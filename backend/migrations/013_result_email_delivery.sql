CREATE TABLE IF NOT EXISTS topik_app.result_email_deliveries (
    delivery_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES topik_app.sessions(session_id) ON DELETE CASCADE,
    email_normalized TEXT NOT NULL,
    email_original TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'failed')),
    result_token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    provider_message_id TEXT,
    failure_code TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS result_email_deliveries_session_idx
    ON topik_app.result_email_deliveries(session_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS result_email_deliveries_active_idx
    ON topik_app.result_email_deliveries(session_id, accepted_at DESC)
    WHERE status = 'accepted' AND revoked_at IS NULL;
