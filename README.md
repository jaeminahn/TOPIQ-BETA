# UNIGATE TOPIK II Mock Test

`topiq.unigate.kr`용 TOPIK II 읽기·듣기 모의고사입니다.

- 프론트엔드: React, Vite, TypeScript, Tailwind CSS, Pretendard
- 백엔드: Fastify, TypeScript, PostgreSQL
- 인증·스토리지: Supabase Auth + Supabase Storage
- 음성: Google Cloud Gemini 2.5 Flash TTS
- 운영: Vercel 프론트엔드 + Render API

## 구조와 데이터

```text
Unigate-Web/
├─ frontend/                    # 사용자·관리자 React SPA
├─ backend/
│  ├─ migrations/              # topik_app 마이그레이션
│  └─ src/                     # API, 미디어 생성 서비스, Supabase 연결
├─ POSTGRESQL_QUESTION_BANK.md
└─ render.yaml
```

PostgreSQL은 두 스키마를 사용합니다.

- `topik_bank`: 변경하지 않는 문제은행과 문항 버전
- `topik_app`: 모의고사, 응답, 관리자, 오디오·이미지 자산과 연결

고정 세트:

| 모의고사 | `set_id` | 시간 |
| --- | --- | --- |
| 읽기 1회 | `64c027ea-fa18-5cd3-8039-79ecde41916a` | 70분 |
| 읽기 2회 | `fc0a5fa7-391e-586f-ab7c-1b7b8193358a` | 70분 |
| 듣기 1회 | `3ffc10a1-db41-5718-b479-60224edec836` | 60분 |
| 듣기 2회 | `c5e3af83-93d5-5bef-a2e7-5186ee358f9c` | 60분 |

듣기 모의고사는 음원 50개와 필수 선택지 이미지가 준비된 뒤 관리자 페이지에서 공개합니다.

## 요구사항과 pnpm 설치

- Node.js 22 이상
- PostgreSQL과 기존 `topik_bank` 문제은행
- Supabase 프로젝트
- Google Cloud 프로젝트와 Cloud Text-to-Speech API

이 저장소는 pnpm 11을 사용합니다. `pnpm is not recognized` 오류가 나면 별도 전역 설치 대신 Corepack을 사용합니다.

```powershell
corepack enable
corepack pnpm --version
corepack pnpm install
```

`corepack enable` 권한 오류가 나더라도 `corepack pnpm ...` 형식은 사용할 수 있습니다. 이후 README의 `pnpm` 명령은 모두 `corepack pnpm`으로 바꿔 실행해도 됩니다.

## 로컬 개발

### 1. 설치와 환경변수

```powershell
cd C:\Users\khyun\Projects\Unigate-Web
corepack pnpm install
Copy-Item backend\.env.example backend\.env.development
Copy-Item frontend\.env.example frontend\.env
```

`backend/.env.development`에서 다음 값을 설정합니다. 백엔드는 실행 위치와 관계없이
`NODE_ENV`에 따라 `.env.development`, `.env.test`, `.env.production`을 먼저 읽고,
해당 값이 없으면 `backend/.env`를 보조 설정으로 읽습니다. Render 등의 시스템 환경변수는 파일보다 우선합니다.

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/topik
DATABASE_SSL=disable
APP_ORIGINS=http://localhost:5173,https://topiq.unigate.kr
APP_ORIGINS_EXTRA=
TRUST_PROXY=false

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_AUDIO_BUCKET=topik-listening-audio
SUPABASE_MEDIA_BUCKET=topik-question-media

BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=no-reply@unigate.kr
BREVO_SENDER_NAME=UNIGATE
BREVO_ALERT_EMAIL_1=first-admin@unigate.kr
BREVO_ALERT_EMAIL_2=second-admin@unigate.kr
BREVO_BILLING_START_DATE=2026-09-11
BREVO_MONTHLY_LIMIT=5000
BREVO_WARNING_THRESHOLD=4990
RESULT_EMAIL_SESSION_HOURLY_LIMIT=5
PUBLIC_APP_URL=http://localhost:5173

GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS_JSON={"type":"service_account",...}
GOOGLE_TTS_MODEL=gemini-2.5-flash-tts
GOOGLE_TTS_FEMALE_VOICE=Aoede
GOOGLE_TTS_MALE_VOICE=Charon
FFMPEG_PATH=ffmpeg
MEDIA_GENERATION_TIMEOUT_MS=240000

ADMIN_EMAIL=admin@unigate.kr
ADMIN_PASSWORD=12자-이상의-강한-임시-비밀번호
```

`GOOGLE_CLOUD_CREDENTIALS_JSON`은 줄바꿈 없는 JSON으로 설정합니다. 해당 서비스 계정에는 Cloud Text-to-Speech 합성 권한만 부여합니다. 실제 키와 서비스 역할 키는 Git에 커밋하지 않습니다. 완성형 듣기 음원 조합에는 FFmpeg가 필요하며 배포 Docker 이미지에는 포함되어 있습니다. 로컬에서는 FFmpeg를 설치하거나 `FFMPEG_PATH`에 실행 파일 경로를 지정합니다.

`frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 2. DB 마이그레이션

```powershell
corepack pnpm db:migrate
```

마이그레이션은 `topik_bank`를 수정하지 않고 `topik_app`만 생성·확장합니다. advisory lock과 체크섬으로 중복 적용 및 적용된 SQL 변경을 방지합니다.

### 3. 최초 관리자 계정 1개 생성

Supabase 이메일 로그인이 활성화되어 있어야 합니다.

```powershell
corepack pnpm --filter @unigate/topik-api admin:bootstrap
```

명령은 `ADMIN_EMAIL` 기준으로 멱등 실행됩니다. Supabase Auth 사용자를 만들고 `topik_app.admin_users` 허용 목록에 등록합니다. 생성 후 `ADMIN_PASSWORD`는 `.env`나 배포 비밀값에서 제거해도 됩니다.

### 로컬 PostgreSQL을 Supabase로 복제

`topik_bank`, `topik_app`의 스키마와 데이터를 Supabase PostgreSQL로 그대로 복제할 수 있습니다.
Supabase가 관리하는 `auth`, `storage`, `realtime` 등의 스키마와 Storage 파일 자체는 변경하지 않습니다.

먼저 로컬 백엔드와 DB 쓰기 작업을 중지합니다. Supabase Dashboard의 **Connect**에서
Session pooler(포트 5432) 연결 문자열을 복사하고, 비밀번호를 URL 인코딩한 뒤 현재
PowerShell 세션의 환경변수로만 설정합니다.

```powershell
$env:SUPABASE_DB_URL = 'postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require'

# 연결, PostgreSQL 버전, 스키마와 행 수만 점검
corepack pnpm db:copy-to-supabase -- --dry-run

# 대상 project ref를 다시 확인한 뒤 실제 백업·복제·검증 수행
corepack pnpm db:copy-to-supabase -- --confirm-target-ref PROJECT_REF

Remove-Item Env:SUPABASE_DB_URL
```

원본 연결은 `LOCAL_DATABASE_URL`이 있으면 이를 사용하고, 없으면
`backend/.env.development`의 `DATABASE_URL`을 사용합니다. 대상의 기존 두 스키마는
복원 전에 `.tmp/postgres-to-supabase/<timestamp>/target-before.dump`로 백업됩니다.
실제 교체는 단일 트랜잭션으로 실행되며, 완료 후 모든 테이블의 행 수를 원본과 비교합니다.

이 방식은 Supabase가 권장하는 Session pooler와 `pg_dump`/`pg_restore` 흐름을 따릅니다.
자세한 연결 방식과 마이그레이션 주의사항은 [Supabase 연결 문서](https://supabase.com/docs/guides/database/connecting-to-postgres)와
[Postgres 마이그레이션 문서](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)를 참고하세요.

### 4. 실행

프론트엔드와 백엔드 동시 실행:

```powershell
corepack pnpm dev
```

개별 실행:

```powershell
corepack pnpm --filter @unigate/topik-api dev
corepack pnpm --filter @unigate/topik-web dev
```

| 서비스 | 주소 |
| --- | --- |
| 사용자 페이지 | `http://localhost:5173` |
| 관리자 페이지 | `http://localhost:5173/admin` |
| API | `http://localhost:4000` |
| 상태 확인 | `http://localhost:4000/health` |

### 6. 듣기 음원 생성과 공개

1. `/admin`에서 `ADMIN_EMAIL` 계정으로 로그인합니다.
2. 듣기 회차의 `누락 음원 일괄 생성`을 누릅니다.
3. 브라우저가 누락된 그룹별 생성 API를 한 건씩 호출하고 완료를 기다립니다. 한 회차는 1~20번 단일 음원 20개와 21~50번 공통 음원 15개, 총 35개 그룹입니다.
4. 여자 `Aoede`, 남자 `Charon` 음성이 적용되고 MP3가 Supabase에 저장됩니다.
5. 음원 `50/50`, 이미지 준비 수가 요구 수와 같으면 `시험 공개`를 누릅니다.

화면 이동·새로고침·닫기는 남은 요청을 중단합니다. 이미 서버가 받은 요청은 제한시간 내에서 완료될 수 있습니다. 다시 열면 저장된 자산으로 누락 대상을 계산합니다. 동일 대본·모델·음성·스타일은 재사용하며 21~50번 묶음 문제는 같은 음원을 공유합니다. 실패해도 다음 항목으로 진행하고, 완료 후 실패 항목만 수동으로 재시도합니다. 생성 자동 재시도와 작업 이력은 없습니다.

관리자 페이지는 `요약`, `듣기 문항`, `읽기 문항`, `사용자 응답`, `데이터 추출`, `사전등록` 탭으로 나뉩니다.

- 듣기: 생성 전 말하기 속도(0.80~1.20배)와 추가 스타일 지시를 설정할 수 있습니다. 재생성하면 새 설정이 음원 자산에 기록됩니다.
- 문항 수정: 수정한 문항만 새 `item_version`으로 저장하고 회차 연결 스냅샷을 갱신합니다. 실제 낭독 내용이 같은 그룹은 기존 음원을 재사용하며, 단일 문제 문장이나 공통 대본이 바뀐 그룹만 다시 생성합니다.
- 음원 삭제: 공통 대본 그룹의 모든 문항 연결을 함께 해제하며, 다른 문항이 공유하지 않는 파일은 Supabase Storage에서도 삭제합니다. 재생 이력이 있는 SQL 행은 분석 참조를 위해 삭제 표시만 남깁니다.
- 생성 오류: 현재 관리자 화면의 해당 음원·이미지에 표시합니다. 전체·완료·실패 건수와 실패 항목 재시도 버튼을 제공합니다. 요약 화면의 작업 대기·진행·실패 집계와 주기적 폴링은 제거했습니다.
- 읽기: 세트·검색 필터로 본문, 보기, 정답, 해설, 목표 급수를 검수할 수 있습니다.
- 문항 이력: 듣기와 읽기 모두 각 문항을 펼친 뒤 우측 상단의 `이력` 버튼에서 해당 문항의 버전을 확인합니다.
- 미디어 교체: 새 그림·그래프·음원이 현재 문항에 연결되면 이전 자산은 정리 큐로 넘어가며, 더 이상 공유되지 않는 Supabase Storage 객체와 DB 자산 행을 안전하게 삭제합니다.
- 결과 이메일: 요약 화면에서 매월 11일 00:00(Asia/Seoul)에 갱신되는 Brevo 사용량과 ON/OFF 상태를 확인합니다. 한 시험 세션은 최근 60분 동안 최대 5회 발송할 수 있고, 4,990건째 결과 메일이 접수되면 환경변수의 두 관리자 주소로 경고 메일을 각각 보냅니다. 전체 5,000건 예약 시 신규 결과 메일은 차단합니다.
- 사용자 응답: 세션 목록에서 최신 Brevo 접수 완료 이메일 원문을 확인하고, 제출 세션을 펼쳐 문항별 선택 답안, 정답 여부를 확인합니다. 체크한 세션만 삭제하거나 `전체 응답 삭제` 문구를 입력해 제출 완료 세션을 모두 삭제할 수 있습니다. 진행 중 시험과 기존 마케팅 수신 동의는 보존되고, 결과 이메일 이력은 세션과 함께 삭제되며 삭제 수량과 관리자는 감사 로그에 기록됩니다.
- 문항별 풀이 시간 수집은 중단되었습니다. `POST /v1/sessions/:sessionId/items/:itemOrder/events`는 제거되어 404를 반환하며, 답 저장 `PUT /v1/sessions/:sessionId/items/:itemOrder/answer`는 `{ clientEventId, selectedOption }`만 사용합니다. 구형 요청의 `durationMs`는 무시합니다. 과거 DB 시간 컬럼·값은 보존하고 새 INSERT는 해당 컬럼의 기본값 `0`을 사용하지만, 이를 측정값으로 집계하거나 관리자 화면·CSV에 제공하지 않습니다. 시험 제한시간·자동 제출과 세션 전체 경과시간은 유지합니다. 배포는 백엔드 다음 프론트 순서로 적용하며 DB 마이그레이션은 필요 없습니다.
- 데이터 추출: 시험·영역·기간·응시 상태 등의 조건을 적용하고 예상 행 수를 확인한 뒤 문항 분석, 사용자 문항별 응답, 응시 세션 요약 CSV를 내려받습니다. 문항·응답 CSV에는 이메일을 넣지 않으며, 세션 요약 CSV의 `result_email` 열에는 최신 Brevo 접수 완료 이메일 원문이 포함됩니다. IP·접근 토큰·결과 토큰은 모든 CSV에서 제외됩니다.

관리자 기능을 업데이트한 기존 환경에서는 배포 전에 새 마이그레이션을 적용합니다.

사전등록은 `018_preregistrations.sql`부터 별도 `topik_app.preregistrations` 테이블에 저장합니다.
랜딩 첫 화면의 이메일 신청은 `001-00000001`, TOPIK 결과 이메일 신청은 `002-00000001` 형식의
경로별 ID를 사용합니다. 신청 버튼 클릭으로 개인정보·마케팅 동의를 기록하고, TOPIK 결과
메일의 발송 실패·한도 초과와 관계없이 신청을 보존합니다. 기존 결과 이메일은 소급 등록하지 않습니다.

관리자의 `사전등록` 탭에서 경로, 신청 기간(KST), 이메일 검색, 중복 제거를 선택한 뒤
`필터 적용`을 누릅니다. 중복 제거는 조건에 맞는 신청 중 이메일당 최신 기록을 남기며,
CSV는 페이지와 관계없이 적용된 조건의 전체 행을 추출합니다. 각 행의 삭제 버튼은 해당
신청 ID 한 건만 영구 삭제합니다. 중복 제거 중에는 이전 신청이 다시 표시될 수 있습니다.
삭제는 시험 응답·결과 메일에 영향을 주지 않으며, 관리자·신청 ID·삭제 시각만 감사 기록에 남깁니다.

배포 순서는 DB 마이그레이션 → 백엔드 → 프론트엔드입니다. 이전 프론트엔드의 결과 이메일
요청에 사전등록 동의 버전이 없으면 사전등록은 생성하지 않습니다. 다만 사후 설문이 미완료된
세션의 결과 메일 요청은 설문이 필수이므로 구형 화면은 새로고침해야 합니다.

```powershell
corepack pnpm db:migrate
```

## TOPIK II 사후 설문 (019)

`019_post_exam_survey.sql`을 적용한 뒤 백엔드, 프론트엔드 순서로 배포합니다.
기존 마이그레이션과 기존 응답은 수정하지 않습니다. `attempt_feedback`의 추가 컬럼:

- 설문: `nationality_code`, `birth_year`, `topik_reasons` (TEXT[]), `topik_reason_other`,
  `korean_study_duration`, `topik_experience`, `current_topik_level`, `target_topik_level`.
- 최초 제출 기록: `survey_version`, `survey_completed_at`, `survey_privacy_consent`,
  `survey_privacy_consent_version`, `survey_privacy_consented_at`.

`POST /v1/sessions/:sessionId/result-email`은 최초 제출 시 별점·이메일과 함께 `survey`를 받습니다.
입력 키는 `nationalityCode`, `birthYear`, `topikReasons`, `topikReasonOther`,
`koreanStudyDuration`, `topikExperience`, `currentTopikLevel`, `targetTopikLevel`,
`privacyConsentVersion`입니다. 선택 코드와 한영 표시는 `backend/src/survey/catalog.json`을
프론트와 백엔드가 공유합니다. 출생연도는 1950년부터 KST 기준 올해까지입니다.

`GET /v1/sessions/:sessionId`의 `surveyCompleted`가 참이면 이후 별점·이메일만 받습니다.
서버는 세션 잠금 안에서 완료 상태를 판단하고 최초 설문과 동의 시각을 보존합니다.
설문은 메일 예약과 함께 커밋되므로 발송업체 실패 후에도 완료 상태가 유지됩니다.
미수집 세션의 누락 요청은 `SURVEY_REQUIRED`, 잘못된 답변은 `INVALID_SURVEY` (400)이며,
검증 전 메일 예약이나 사전등록을 생성하지 않습니다. 유효한 출시 알림 신청은 기존처럼 메일 한도·발송 실패와 독립적으로 보존됩니다.

관리자 `GET /v1/admin/responses/sessions/:sessionId`에 `survey`가 추가되며,
세션 상세와 세션 요약 CSV에서 설문과 동의 기록을 확인할 수 있습니다.
과거 데이터는 미수집(NULL)으로 남습니다. 문항 CSV와 GA 이벤트에는 설문 응답을 추가하지 않습니다.

SQL·동시 제출 테스트는 운영 DB가 아닌 빈 `unigate_survey_test` 데이터베이스를 가리키는
`SURVEY_TEST_DATABASE_URL`이 설정된 경우에만 실행됩니다. 테스트가 생성한 스키마만 정리합니다.

## 검사와 로컬 프로덕션 실행

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

### DB 연동 테스트: 두 가지 방법

실제 PostgreSQL을 확인하는 테스트는 `DATABASE_URL`이 설정된 경우에만 실행됩니다.
현재 DB 통합 테스트는 `topik_bank`의 읽기 모의고사 두 세트가 각각 50문항으로
정상 구성되어 있는지 읽기 전용 쿼리로 확인합니다.

#### 방법 1. Supabase 운영 DB 데이터로 테스트

Supabase Dashboard의 **Connect**에서 Session pooler(포트 5432) 연결 문자열을 복사합니다.
비밀번호에 특수문자가 있으면 URL 인코딩하고, 연결 정보는 파일에 저장하지 말고 현재
PowerShell 세션에서만 설정합니다.

```powershell
$env:DATABASE_URL = 'postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require'
$env:DATABASE_SSL = 'require'

corepack pnpm --filter @unigate/topik-api test tests/integration/question-bank.integration.test.ts

Remove-Item Env:DATABASE_URL
Remove-Item Env:DATABASE_SSL
```

이 명령은 현재의 읽기 전용 DB 통합 테스트만 실행합니다. 운영 DB 연결값을 설정한
상태에서는 `db:migrate`, 개발 서버, 관리자 기능처럼 데이터를 변경할 수 있는 명령을
실행하지 않습니다. 테스트가 추가되면 운영 DB에서 실행하기 전에 쿼리가 읽기 전용인지
다시 확인합니다. 이 테스트에는 Supabase Auth·Storage 키가 필요하지 않습니다.

#### 방법 2. 로컬 PostgreSQL의 `topik_bank`로 테스트·개발

`topik_bank`는 별도 서버 주소로 연결하는 DB가 아니라 `DATABASE_URL`이 가리키는
PostgreSQL 데이터베이스 안의 스키마입니다. 백엔드는 `topik_app`과 `topik_bank`를
스키마 간 조인하므로 두 스키마가 같은 데이터베이스에 있어야 합니다.

이미 `topik_bank`가 들어 있는 로컬 DB를 사용하는 경우 다음과 같이 연결과 스키마를
확인하고 테스트합니다.

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/topik'
$env:DATABASE_SSL = 'disable'

psql --dbname $env:DATABASE_URL --command "SELECT to_regclass('topik_bank.item_versions');"
corepack pnpm db:migrate
corepack pnpm --filter @unigate/topik-api test tests/integration/question-bank.integration.test.ts

Remove-Item Env:DATABASE_URL
Remove-Item Env:DATABASE_SSL
```

`to_regclass` 결과가 `topik_bank.item_versions`가 아니라 빈 값이면 해당 로컬 DB에
문제은행이 없는 것입니다. 문제은행이 다른 로컬 DB에 있다면 그 DB의 `topik_bank`
스키마를 백업한 뒤, 앱이 사용할 DB에 복원합니다. 아래 복원 예시는 대상 DB가 비어
있거나 기존 `topik_bank` 객체와의 충돌을 미리 정리한 경우에만 사용합니다.

```powershell
New-Item -ItemType Directory -Force .tmp | Out-Null
$env:QUESTION_BANK_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/question_bank_source'
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/topik'

pg_dump --dbname $env:QUESTION_BANK_DATABASE_URL --schema topik_bank --format custom --no-owner --no-privileges --file .tmp/topik_bank.dump
pg_restore --dbname $env:DATABASE_URL --no-owner --no-privileges .tmp/topik_bank.dump
corepack pnpm db:migrate

Remove-Item Env:QUESTION_BANK_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

로컬 앱을 계속 실행할 때는 같은 값을 `backend/.env.development`의 `DATABASE_URL`과
`DATABASE_SSL=disable`에 설정한 뒤 `corepack pnpm dev`를 실행합니다. 관리자 로그인과
미디어 기능도 확인하려면 기존 안내대로 Supabase Auth·Storage 환경변수는 별도로
설정해야 합니다. DB 비밀번호와 덤프 파일은 커밋하지 않습니다.

백엔드 프로덕션 방식:

```powershell
corepack pnpm --filter @unigate/topik-api build
corepack pnpm --filter @unigate/topik-api start
```

프론트엔드 프로덕션 미리보기:

```powershell
corepack pnpm --filter @unigate/topik-web build
corepack pnpm --filter @unigate/topik-web preview
```

## 운영 배포

### Render 백엔드

루트의 `render.yaml`을 Blueprint로 연결합니다.

- 도메인: `https://topiq-api.unigate.kr`
- Root Directory: `backend`
- 배포 전: `node dist/migrate.js`
- 상태 확인: `/health`

Render 비밀값:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLOUD_PROJECT_ID=...
GOOGLE_CLOUD_CREDENTIALS_JSON={...}
BREVO_API_KEY=xkeysib-...
```

일반 환경변수는 `render.yaml`에 정의되어 있습니다. 프론트엔드 도메인을 추가할 때는
Render의 `APP_ORIGINS_EXTRA`에 `https://new-frontend.example.com`처럼 프로토콜을 포함한
주소를 설정하고 API를 재배포합니다. 여러 주소는 쉼표로 구분하며, 경로와 마지막 `/`는
넣지 않습니다. 기존 `APP_ORIGINS`와 추가 주소가 모두 CORS 허용 목록에 포함되고,
`APP_ORIGINS_EXTRA`가 비어 있으면 기존 설정만 사용합니다.

최초 배포 후 Render Shell에서 한 번 실행합니다.

```bash
ADMIN_EMAIL=admin@unigate.kr ADMIN_PASSWORD='strong-temporary-password' node dist/bootstrap-admin.js
```

관리자 초기화 후 `ADMIN_PASSWORD` 비밀값을 제거합니다.

### Vercel 프론트엔드

| 설정 | 값 |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Install Command | `cd .. && corepack pnpm install --frozen-lockfile` |
| Build Command | `corepack pnpm --filter @unigate/topik-web build` |
| Output Directory | `dist` |
| Domain | `topiq.unigate.kr` |

Vercel 환경변수:

```env
VITE_API_BASE_URL=https://topiq-api.unigate.kr
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY`, Google 서비스 계정, 관리자 비밀번호는 프론트엔드에 절대 넣지 않습니다.

## 배포 후 확인

```powershell
Invoke-RestMethod https://topiq-api.unigate.kr/health
Invoke-RestMethod https://topiq-api.unigate.kr/v1/exams
```

확인 항목:

1. `/admin`에서 관리자 로그인 및 통계 표시
2. 비관리자 Supabase 계정의 관리자 API 접근 거부
3. 듣기 음원 단일·일괄 생성, 남녀 음성, 미리 듣기
4. Supabase 객체와 PostgreSQL URL 연결
5. 준비되지 않은 듣기 시험 공개 거부
6. 실전 모드 자동 재생·횟수 제한과 연습 모드 자유 재생
7. 묶음 듣기 두 문항 동시 표시 및 문항별 답안 저장
8. 제출 시 50개 최종 응답 생성, 필수 별점·이메일 입력과 Brevo 결과 링크 발송
9. 메일 링크를 새 브라우저에서 열어 점수·오답·듣기 대본 확인, 만료·폐기 링크 접근 거부

Google Cloud 요청 형식은 [Gemini TTS 공식 문서](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)를 기준으로 합니다.


## IRT 메타데이터 제거 (020)

`backend/migrations/020_remove_irt_metadata.sql`은 다음 컬럼과 과거 값을 삭제합니다.

| 테이블 | 삭제 컬럼 |
| --- | --- |
| `topik_app.session_items` | `theta_before`, `theta_after`, `policy_version` |
| `topik_app.response_observations` | `theta_before`, `theta_after`, `policy_version`, `estimation_run_id`, `estimator_version` |
| `topik_bank.item_versions` | `irt_difficulty`, `irt_discrimination`, `predicted_difficulty` |
| `topik_bank.question_sets` | `default_predicted_difficulty` |

`topik_app.theta_estimation_runs` 테이블도 삭제합니다. 관련 외래키·인덱스·제약조건은 해당 컬럼과 함께 제거됩니다. 두 문항 뷰 `current_items`, `current_set_contents`는 남은 컬럼 및 소유권·테이블/컬럼 접근 권한을 보존하여 재생성합니다. 예상하지 못한 의존성이 있으면 CASCADE로 지우지 않고 트랜잭션 전체가 실패합니다. 과거 마이그레이션 및 Supabase 초기 스키마는 변경하지 않습니다.

API 주소와 사용자 답 저장·제출·결과 조회 계약은 유지합니다. 관리자 응답에서 다음 필드만 제거합니다.

- `GET /v1/admin/reading/items`: `items[].predictedDifficulty`
- `GET /v1/admin/question-sets/:setId/items/:itemId/versions`: `versions[].predictedDifficulty`
- `GET /v1/admin/responses/sessions/:sessionId`: 문항 응답의 `policyVersion`
- `GET /v1/admin/exports/:dataset/preview`, `GET /v1/admin/exports/:dataset.csv`: `questions`의 `predicted_difficulty`, `irt_difficulty`, `irt_discrimination` 및 `responses`의 `policy_version`. `sessions`는 변경 없음.

정답률의 두 분모(응답 수/전체 출제 수), 선택지 분포, 문항 버전, 목표 급수, 점수 기반 예상 급수, 사후 설문은 유지합니다. 기존 시간 컬럼의 보존 정책도 유지합니다.

배포는 **DB 백업 → 요청 차단 및 기존 백엔드 중지 → `pnpm db:migrate` → 새 백엔드·프론트 배포 → 풀이·채점·관리자 확인 후 서비스 재개** 순서입니다. 구버전 서버는 삭제된 컬럼을 참조하므로 신구 서버를 동시에 운영하면 안 됩니다. 삭제 후 구버전 서버만 재배포하는 롤백은 지원하지 않으며, 데이터 복구에는 백업 복원이 필요합니다. 운영 DB 적용·배포는 로컬 코드 검증과 별도로 수행합니다.

임시 PostgreSQL 검증: 비어 있는 전용 DB `unigate_irt_test`를 만들고 `IRT_TEST_DATABASE_URL`을 해당 DB로 지정한 뒤 `pnpm --filter @unigate/topik-api test`를 실행합니다. 테스트는 운영 연결 설정을 사용하지 않고 DB 이름과 빈 스키마를 검사합니다.


### TTS·이미지 직접 생성 API (021)

생성 요청 안에서 생성 → Storage 저장 → 짧은 DB 트랜잭션으로 문항 연결 → 결과 반환까지 처리합니다.
`tts-worker.ts`, `visual-worker.ts`의 작업 조회·상태 기록·주기 실행은 삭제하고, 생성 로직은
`backend/src/listening/tts-service.ts`와 `backend/src/media/visual-service.ts`로 옮겼습니다.
메일 워커와 오래된 미디어 정리 워커는 유지합니다.

| API | 응답 및 변경 |
| --- | --- |
| `POST /v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/tts` | `200 { audioAssetId, positions, reused }` |
| `POST /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/generate` | `200 { visualAssetId, url, reused }` |
| `POST /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/generate` | 같은 이미지 응답 |
| `POST /v1/admin/listening/sets/:setId/tts` | 삭제, 404 |
| `POST /v1/admin/listening/sets/:setId/visuals/generate` | 삭제, 404 |
| `POST /v1/admin/reading/sets/:setId/visuals/generate` | 삭제, 404 |
| `GET /v1/admin/tts/jobs` | 삭제, 404 |

생성 경로의 `/versions/:setVersion/` 호환 별칭도 삭제했습니다. 업로드·삭제·미리듣기·공개 경로는 유지합니다.
`forceRegenerate`와 TTS의 `ttsStyle` 입력은 유지하지만 `202`, `jobId`, `jobIds`, `queued` 응답은 없습니다.
목록 응답의 `generationJobId`, `generationStatus`, `generationError`, `generationTtsStyle`, `lastError`는 삭제했습니다.
자산의 실제 `ttsStyle`·대본·파일 정보는 유지합니다. 듣기 목록 `status` 필터는 `ready`, `missing`만 허용하고 `failed`는 400입니다.
대시보드의 `jobsQueued`, `jobsProcessing`, `jobsFailed`도 삭제했습니다.

`021_remove_generation_jobs.sql`은 아래 테이블을 순서대로 삭제합니다. 과거 작업 이력도 함께 삭제되므로 백업이 필요합니다.

1. `topik_app.tts_generation_job_targets`
2. `topik_app.tts_generation_jobs`
3. `topik_app.visual_generation_jobs`

새 테이블이나 자산 컬럼 변경은 없습니다. 음원·이미지 자산, 문항 연결, 재생 이력, Storage 파일은 보존합니다.
과거 마이그레이션과 Supabase 초기 스키마는 수정하지 않습니다. 마이그레이션 실행기가 트랜잭션으로 감싸며,
예상하지 못한 외부 의존성은 `CASCADE`로 삭제하지 않고 전체 롤백합니다.

생성은 TTS·이미지 각각 한 요청만 허용합니다. 전용 PostgreSQL 연결의 세션 advisory lock을 사용하므로
**Direct 연결 또는 Session pooler**가 필요하며 Transaction pooler는 지원하지 않습니다.
중복 요청은 `409 GENERATION_BUSY`, 제한시간 초과는 `504 GENERATION_TIMEOUT`, 생성업체 오류는 502입니다.
기본 제한시간은 `MEDIA_GENERATION_TIMEOUT_MS=240000`이며 Google 요청·Storage 업로드·FFmpeg에 취소 신호가 전달됩니다.
`TTS_WORKER_ENABLED`, `VISUAL_WORKER_ENABLED`는 삭제했습니다.
외부 생성 중 DB 트랜잭션을 유지하지 않으며, 연결 직전에 현재 문항 버전을 다시 검사합니다.
기존 파일은 새 자산 연결 성공 전까지 유지합니다. 연결 실패 시 새 파일만 정리하며, COMMIT 응답 유실로 저장 결과가 불명확하면
파일을 보존하고 목록 조회로 확인합니다. 응답 유실 후에도 먼저 목록을 다시 조회하여 저장 여부를 확인하고 수동 재시도합니다.
구형 음원은 계속 조회·재생할 수 있지만 신규 생성은 현재 시험 음원 형식만 사용합니다.

적용 순서: **DB 백업 → 관리자 생성 차단 → 기존 생성 작업 종료 확인 및 기존 서버 중지 → 021 마이그레이션 → 새 백엔드·프론트 배포 → 생성·재생 확인**.
컬럼/테이블을 삭제한 상태에서 구버전 서버만 재배포하지 않습니다. 복구하려면 백업 복원과 호환 서버를 함께 준비해야 합니다.
배포 전 실제 프록시·호스팅 경로의 요청 제한이 설정된 생성 제한시간보다 긴지 확인하고, 대표 TTS 그룹의 실제 소요시간을 측정합니다.
로컬 검증은 Google·Storage를 대체하며 유료 생성 API를 호출하지 않습니다.

회귀 검증: `pnpm test`, `pnpm typecheck`, `pnpm build`.
추가 DB 검증은 비어 있는 임시 `unigate_irt_test` DB를 `IRT_TEST_DATABASE_URL`로 지정하여
`backend/tests/integration/irt-removal.integration.test.ts`를 실행합니다. 020과 021을 순서대로 검증하며
테스트용 스키마를 생성·삭제하므로 운영 DB에는 실행하지 않습니다.


### 답 변경 기록 수집 중단

답 선택·변경·재시도·이어 풀기는 유지하되, 변경 여부·변경률·선택 횟수는 수집하거나 표시하지 않습니다.
`answer_states`는 최신 선택 답과 선택 시각을 저장하고 `selection_count`를 더 이상 증가시키지 않습니다.
`response_events`는 `client_event_id` 중복 방지 용도로 유지합니다. 새 이벤트에는 선택 번호를 저장하지 않으며,
기존 NOT NULL/선택 코드 제약을 만족하도록 `event_type='answer_selected'`를 고정 사용합니다. 답 변경을 구분하는 값이 아닙니다.
`response_observations`는 최종 답·정오답·미응답 결과를 계속 저장하되 `answer_changed`를 계산·전달하지 않습니다.
기존 컬럼과 과거 행은 보존합니다. 새 행의 기존 DB 기본값(`selection_count=1`, `answer_changed=false`)은 측정 결과로 취급하지 않습니다.
SQL 마이그레이션은 필요 없습니다.

답 저장 API와 제출·결과 조회 API 경로/계약은 유지합니다.
`GET /v1/admin/responses/sessions/:sessionId`의 문항별 `answerChanged`를 제거합니다.
CSV 및 미리보기의 `questions`에서 `answer_changed_count`, `answer_changed_rate_pct`를,
`responses`에서 `answer_changed`, `selection_count`를 제거합니다. `sessions`는 변경하지 않습니다.
관리자 응답 카드·상세 팝업의 답안 변경 표시와 GA `question_answer.answer_changed`도 제거합니다.
정답률의 두 분모, 선택지 분포, 채점, 제한시간·자동 제출, 사후 설문은 유지합니다.
백엔드 → 프론트 순서로 적용하며, 이번 변경은 운영 DB의 과거 이력을 삭제하지 않습니다.
