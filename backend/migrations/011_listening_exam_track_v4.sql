ALTER TABLE topik_app.tts_audio_assets
  DROP CONSTRAINT IF EXISTS tts_audio_assets_narration_version_check;

ALTER TABLE topik_app.tts_audio_assets
  ADD CONSTRAINT tts_audio_assets_narration_version_check
    CHECK (narration_version IN ('dialogue_v1', 'exam_track_v2', 'exam_track_v3', 'exam_track_v4'));
