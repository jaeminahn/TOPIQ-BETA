-- Media deletion now runs during the replacement request. Existing assets and
-- storage objects are retained; pending cleanup jobs are no longer needed.
DROP TABLE IF EXISTS topik_app.media_cleanup_jobs;
