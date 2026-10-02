CREATE TABLE topik_app.marathon_browsers (
    browser_id UUID PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    answered_count INTEGER NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
    registered_at TIMESTAMPTZ,
    registration_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE topik_app.sessions ADD COLUMN browser_id UUID REFERENCES topik_app.marathon_browsers(browser_id);
CREATE INDEX sessions_browser_idx ON topik_app.sessions(browser_id) WHERE browser_id IS NOT NULL;

CREATE TABLE topik_app.marathon_sessions (
    session_id UUID PRIMARY KEY,
    browser_id UUID NOT NULL REFERENCES topik_app.marathon_browsers(browser_id),
    section TEXT NOT NULL CHECK (section IN ('reading','listening')),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','abandoned')),
    request_id UUID NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    abandoned_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX marathon_active_section_idx ON topik_app.marathon_sessions(browser_id,section) WHERE status='in_progress';

CREATE TABLE topik_app.marathon_difficulties (
    set_id UUID NOT NULL REFERENCES topik_bank.question_sets(set_id),
    item_id UUID NOT NULL,
    difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 3),
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (set_id,item_id)
);
CREATE TABLE topik_app.marathon_difficulty_audits (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    set_id UUID NOT NULL,
    item_id UUID NOT NULL,
    difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 3),
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE topik_app.marathon_items (
    session_id UUID NOT NULL REFERENCES topik_app.marathon_sessions(session_id),
    item_order INTEGER NOT NULL CHECK (item_order > 0),
    mock_test_id UUID NOT NULL REFERENCES topik_app.mock_tests(mock_test_id),
    set_id UUID NOT NULL REFERENCES topik_bank.question_sets(set_id),
    test_position INTEGER NOT NULL,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL,
    difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    requested_difficulty SMALLINT NOT NULL CHECK (requested_difficulty BETWEEN 1 AND 3),
    recent_accuracy DOUBLE PRECISION,
    policy_version TEXT NOT NULL,
    question_json JSONB NOT NULL,
    correct_answer SMALLINT NOT NULL CHECK (correct_answer BETWEEN 1 AND 4),
    explanation TEXT NOT NULL DEFAULT '',
    audio_asset_id UUID,
    visual_asset_ids UUID[] NOT NULL DEFAULT '{}',
    selected_option SMALLINT CHECK (selected_option BETWEEN 1 AND 4),
    selection_count INTEGER NOT NULL DEFAULT 0 CHECK (selection_count >= 0),
    first_selected_at TIMESTAMPTZ,
    final_selected_at TIMESTAMPTZ,
    is_correct BOOLEAN,
    response_time_ms BIGINT NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
    presented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    submit_request_id UUID UNIQUE,
    PRIMARY KEY (session_id,item_order),
    FOREIGN KEY (item_id,item_version) REFERENCES topik_bank.item_versions(item_id,item_version)
);
CREATE INDEX marathon_items_item_idx ON topik_app.marathon_items(item_id,item_version);
CREATE INDEX marathon_items_audio_idx ON topik_app.marathon_items(audio_asset_id) WHERE audio_asset_id IS NOT NULL;
CREATE INDEX marathon_items_visual_idx ON topik_app.marathon_items USING GIN(visual_asset_ids);
CREATE TABLE topik_app.marathon_events (
    request_id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    item_order INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('presented','hidden','heartbeat','selection','prepared','started','completed','interrupted')),
    selected_option SMALLINT CHECK (selected_option BETWEEN 1 AND 4),
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 60000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id,item_order) REFERENCES topik_app.marathon_items(session_id,item_order)
);

CREATE SEQUENCE topik_app.preregistration_marathon_seq;
ALTER TABLE topik_app.preregistrations DROP CONSTRAINT preregistrations_source_check;
ALTER TABLE topik_app.preregistrations DROP CONSTRAINT preregistrations_check;
ALTER TABLE topik_app.preregistrations
    ADD COLUMN marathon_session_id UUID REFERENCES topik_app.marathon_sessions(session_id),
    ADD CONSTRAINT preregistrations_source_check CHECK (source IN ('landing','topik_result','marathon')),
    ADD CONSTRAINT preregistrations_source_code_check CHECK (
        (source='landing' AND source_code='001') OR
        (source='topik_result' AND source_code='002') OR
        (source='marathon' AND source_code='003'));
