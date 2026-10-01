CREATE SEQUENCE topik_app.preregistration_landing_seq;
CREATE SEQUENCE topik_app.preregistration_topik_seq;

CREATE TABLE topik_app.preregistrations (
    record_order BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('landing', 'topik_result')),
    source_code TEXT NOT NULL CHECK (
        (source = 'landing' AND source_code = '001') OR
        (source = 'topik_result' AND source_code = '002')
    ),
    sequence_number BIGINT NOT NULL CHECK (sequence_number > 0),
    registration_id TEXT GENERATED ALWAYS AS (
        source_code || '-' || lpad(sequence_number::text, GREATEST(8, length(sequence_number::text)), '0')
    ) STORED PRIMARY KEY,
    request_id UUID NOT NULL UNIQUE,
    email_original TEXT NOT NULL CHECK (length(email_original) BETWEEN 3 AND 320),
    email_normalized TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
    privacy_consent BOOLEAN NOT NULL CHECK (privacy_consent),
    marketing_consent BOOLEAN NOT NULL CHECK (marketing_consent),
    consent_version TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_id UUID REFERENCES topik_app.sessions(session_id) ON DELETE SET NULL,
    UNIQUE (source, sequence_number)
);

CREATE INDEX preregistrations_latest_idx ON topik_app.preregistrations(consented_at DESC, record_order DESC);
CREATE INDEX preregistrations_source_latest_idx ON topik_app.preregistrations(source, consented_at DESC, record_order DESC);
CREATE INDEX preregistrations_email_latest_idx ON topik_app.preregistrations(email_normalized, consented_at DESC, record_order DESC);
CREATE INDEX preregistrations_session_idx ON topik_app.preregistrations(session_id) WHERE session_id IS NOT NULL;

CREATE TABLE topik_app.preregistration_deletion_audits (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deleted_by UUID NOT NULL,
    registration_id TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
