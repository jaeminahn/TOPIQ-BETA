ALTER TABLE topik_app.sessions
    ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'topik_app.sessions'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE topik_app.sessions DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE topik_app.sessions
    ADD CONSTRAINT sessions_status_check
        CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
    ADD CONSTRAINT sessions_status_timestamps_check
        CHECK (
            (status = 'in_progress' AND submitted_at IS NULL AND abandoned_at IS NULL)
            OR (status = 'submitted' AND submitted_at IS NOT NULL AND abandoned_at IS NULL)
            OR (status = 'abandoned' AND submitted_at IS NULL AND abandoned_at IS NOT NULL)
        );

CREATE INDEX IF NOT EXISTS sessions_abandoned_idx
    ON topik_app.sessions(abandoned_at DESC)
    WHERE status = 'abandoned';
