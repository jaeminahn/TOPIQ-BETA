-- The migration runner applies this file atomically. Unknown dependencies must fail.
DROP TABLE topik_app.tts_generation_job_targets;
DROP TABLE topik_app.tts_generation_jobs;
DROP TABLE topik_app.visual_generation_jobs;
