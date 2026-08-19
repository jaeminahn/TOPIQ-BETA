DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'topik_app' AND table_name = 'mock_tests' AND column_name = 'title_id'
    ) THEN
        ALTER TABLE topik_app.mock_tests RENAME COLUMN title_id TO title_en;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'topik_app' AND table_name = 'mock_tests' AND column_name = 'description_id'
    ) THEN
        ALTER TABLE topik_app.mock_tests RENAME COLUMN description_id TO description_en;
    END IF;
END $$;

UPDATE topik_app.mock_tests
   SET title_en = CASE
           WHEN slug ~ '^topik-ii-reading-[0-9]+$'
               THEN format('TOPIK II Reading Mock Test %s', substring(slug FROM '([0-9]+)$'))
           WHEN slug ~ '^topik-ii-listening-[0-9]+$'
               THEN format('TOPIK II Listening Mock Test %s', substring(slug FROM '([0-9]+)$'))
           ELSE format('TOPIK Mock Test %s', display_order)
       END,
       description_en = CASE
           WHEN slug ~ '^topik-ii-reading-[0-9]+$'
               THEN '50 TOPIK II-style reading questions.'
           WHEN slug ~ '^topik-ii-listening-[0-9]+$'
               THEN '50 TOPIK II-style listening questions.'
           ELSE 'A TOPIK-style mock test.'
       END;

UPDATE topik_app.attempt_feedback SET locale = 'en' WHERE locale = 'id';
UPDATE topik_app.email_subscriptions SET locale = 'en' WHERE locale = 'id';

ALTER TABLE topik_app.attempt_feedback
    DROP CONSTRAINT IF EXISTS attempt_feedback_locale_check;
ALTER TABLE topik_app.attempt_feedback
    ADD CONSTRAINT attempt_feedback_locale_check CHECK (locale IN ('ko', 'en'));

ALTER TABLE topik_app.email_subscriptions
    DROP CONSTRAINT IF EXISTS email_subscriptions_locale_check;
ALTER TABLE topik_app.email_subscriptions
    ADD CONSTRAINT email_subscriptions_locale_check CHECK (locale IN ('ko', 'en'));
