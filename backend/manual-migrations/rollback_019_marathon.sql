-- 수동 실행 전용: 사용자가 제시한 마라톤 019 변경을 되돌립니다.
-- 실행 전 DB 백업 후 마라톤 요청/서버를 중지하고 파일 전체를 한 번에 실행하세요.
-- 마라톤 데이터와 source='marathon' 사전등록은 삭제됩니다.
-- 기존 시험 세션, 일반 사전등록, 사후 설문, 문항, 미디어 파일은 보존합니다.
--
-- 이 파일은 backend/migrations 밖에 있으므로 pnpm db:migrate가 자동 실행하지 않습니다.
-- topik_app.schema_migrations의 기존 마라톤 적용 이력은 수정/삭제하지 않습니다.
-- 현재 실행기는 숫자 접두사가 아니라 전체 SQL 파일명(version)을 비교합니다.
-- 예: 019_marathon.sql과 019_post_exam_survey.sql은 서로 다른 이력입니다.
-- 마라톤 이력을 삭제하면 옛 배포본이 마라톤을 다시 생성할 수 있습니다.
-- 만약 마라톤이 019_post_exam_survey.sql이라는 동일 파일명으로 기록되어 있다면
-- 이 SQL만으로 체크섬 충돌은 해결되지 않습니다. 실제 이력/체크섬을 확인한 뒤
-- 별도로 바로잡아야 합니다. 설문 이력을 임의로 삭제하거나 적용 완료로 표시하지 마세요.
-- Supabase CLI 등의 별도 마이그레이션 이력도 이 파일에서 변경하지 않습니다.
--
-- CASCADE를 쓰지 않으므로 예상 밖 외부 의존성이 있으면 전체 트랜잭션이 실패합니다.
-- 실패한 SQL 편집 세션이 트랜잭션 상태를 유지하면 ROLLBACK; 후 원인을 확인하세요.
-- 마라톤이 이미 제거된 환경에서도 다시 실행할 수 있습니다.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 애플리케이션 마이그레이션 실행기와 동시에 스키마를 변경하지 않습니다.
SELECT pg_advisory_xact_lock(hashtext('unigate_topik_app_migrations'));
LOCK TABLE topik_app.sessions, topik_app.preregistrations IN ACCESS EXCLUSIVE MODE;

-- 마라톤 사전등록만 삭제합니다. landing/001, topik_result/002는 그대로 둡니다.
DELETE FROM topik_app.preregistrations WHERE source = 'marathon';

ALTER TABLE topik_app.preregistrations
    DROP COLUMN IF EXISTS marathon_session_id,
    DROP CONSTRAINT IF EXISTS preregistrations_source_check,
    DROP CONSTRAINT IF EXISTS preregistrations_source_code_check,
    DROP CONSTRAINT IF EXISTS preregistrations_check;

-- 018_preregistrations.sql의 원래 허용 범위와 제약조건 이름을 복원합니다.
ALTER TABLE topik_app.preregistrations
    ADD CONSTRAINT preregistrations_source_check
        CHECK (source IN ('landing', 'topik_result')),
    ADD CONSTRAINT preregistrations_check CHECK (
        (source = 'landing' AND source_code = '001') OR
        (source = 'topik_result' AND source_code = '002')
    );

DROP INDEX IF EXISTS topik_app.sessions_browser_idx;
ALTER TABLE topik_app.sessions DROP COLUMN IF EXISTS browser_id;

-- 참조하는 테이블부터 제거합니다. 각 테이블 소속 인덱스/제약조건도 함께 제거됩니다.
DROP TABLE IF EXISTS topik_app.marathon_events;
DROP TABLE IF EXISTS topik_app.marathon_items;
DROP TABLE IF EXISTS topik_app.marathon_difficulty_audits;
DROP TABLE IF EXISTS topik_app.marathon_difficulties;
DROP TABLE IF EXISTS topik_app.marathon_sessions;
DROP TABLE IF EXISTS topik_app.marathon_browsers;
DROP SEQUENCE IF EXISTS topik_app.preregistration_marathon_seq;

COMMIT;
