ALTER TABLE topik_app.attempt_feedback
    DROP CONSTRAINT IF EXISTS attempt_feedback_locale_check;
ALTER TABLE topik_app.attempt_feedback
    ADD CONSTRAINT attempt_feedback_locale_check
    CHECK (locale IN ('id', 'ko', 'en'));

ALTER TABLE topik_app.email_subscriptions
    DROP CONSTRAINT IF EXISTS email_subscriptions_locale_check;
ALTER TABLE topik_app.email_subscriptions
    ADD CONSTRAINT email_subscriptions_locale_check
    CHECK (locale IN ('id', 'ko', 'en'));
