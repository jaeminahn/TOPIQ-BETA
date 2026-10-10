ALTER TABLE topik_app.attempt_feedback
    ADD COLUMN nationality_code TEXT,
    ADD COLUMN birth_year SMALLINT,
    ADD COLUMN topik_reasons TEXT[],
    ADD COLUMN topik_reason_other TEXT,
    ADD COLUMN korean_study_duration TEXT,
    ADD COLUMN topik_experience TEXT,
    ADD COLUMN current_topik_level SMALLINT,
    ADD COLUMN target_topik_level SMALLINT,
    ADD COLUMN survey_version TEXT,
    ADD COLUMN survey_completed_at TIMESTAMPTZ,
    ADD COLUMN survey_privacy_consent BOOLEAN,
    ADD COLUMN survey_privacy_consent_version TEXT,
    ADD COLUMN survey_privacy_consented_at TIMESTAMPTZ,
    ADD CONSTRAINT attempt_feedback_survey_valid CHECK (
      (survey_completed_at IS NULL AND nationality_code IS NULL AND birth_year IS NULL
       AND topik_reasons IS NULL AND topik_reason_other IS NULL AND korean_study_duration IS NULL
       AND topik_experience IS NULL AND current_topik_level IS NULL AND target_topik_level IS NULL
       AND survey_version IS NULL AND survey_privacy_consent IS NULL
       AND survey_privacy_consent_version IS NULL AND survey_privacy_consented_at IS NULL)
      OR
      (survey_completed_at IS NOT NULL AND nationality_code IS NOT NULL
       AND (nationality_code ~ '^[A-Z]{2}$' OR nationality_code = 'OTHER')
       AND birth_year IS NOT NULL AND birth_year BETWEEN 1950 AND 9999
       AND topik_reasons IS NOT NULL AND cardinality(topik_reasons) BETWEEN 1 AND 7
       AND array_position(topik_reasons, NULL) IS NULL
       AND topik_reasons <@ ARRAY['university','graduate_school','employment','visa','graduation','proficiency','other']::TEXT[]
       AND CASE WHEN 'other' = ANY(topik_reasons)
           THEN topik_reason_other IS NOT NULL AND length(trim(topik_reason_other)) BETWEEN 1 AND 500
           ELSE topik_reason_other IS NULL END
       AND korean_study_duration IS NOT NULL
       AND korean_study_duration IN ('under_6_months','6_to_12_months','1_to_2_years','2_to_3_years','over_3_years')
       AND topik_experience IS NOT NULL AND topik_experience IN ('none','once','twice','three_or_more')
       AND CASE WHEN topik_experience = 'none' THEN current_topik_level IS NULL
           ELSE current_topik_level IS NOT NULL AND current_topik_level BETWEEN 0 AND 6 END
       AND target_topik_level IS NOT NULL AND target_topik_level BETWEEN 3 AND 6
       AND survey_version IS NOT NULL AND survey_version = 'post_exam_survey_v1'
       AND survey_privacy_consent IS TRUE
       AND survey_privacy_consent_version IS NOT NULL AND survey_privacy_consent_version = 'post_exam_survey_v1'
       AND survey_privacy_consented_at IS NOT NULL)
    );

COMMENT ON COLUMN topik_app.attempt_feedback.survey_completed_at IS
    'First complete survey for this session; subsequent result emails update only rating and locale.';
