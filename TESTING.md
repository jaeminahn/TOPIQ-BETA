# UNIGATE TOPIK 테스트 가이드

이 문서는 2026-09-09 기준 테스트 구성, 실행 방법과 검증 범위를 정리한다.

## 테스트 현황

Git 소스 기준으로 테스트 파일은 45개, 테스트 케이스는 195개다.

| 영역 | 파일 수 | 테스트 수 | 실행 환경 |
| --- | ---: | ---: | --- |
| 프런트엔드 | 26 | 95 | Vitest + jsdom + Testing Library |
| 백엔드 | 19 | 100 | Vitest + Fastify inject + PostgreSQL 선택 연동 |
| 합계 | **45** | **195** | |

최근 전체 검증에서는 프런트엔드 95개가 모두 통과했고, 백엔드는 99개가 통과하고 실제 DB 통합 테스트 1개가 건너뛰어졌다. `question-bank.integration.test.ts`는 `DATABASE_URL`이 있을 때만 실행된다.

백엔드 테스트는 역할별로 다음 위치에 둔다.

| 폴더 | 검증 범위 |
| --- | --- |
| `backend/tests/unit` | 도메인 함수, 이메일 본문, 음원·이미지 변환과 요청 생성 |
| `backend/tests/api` | Fastify 라우트, 인증, 입력 검증, HTTP 응답 계약 |
| `backend/tests/repository` | SQL, 트랜잭션, 롤백, 버전 생성, 미디어 삭제 순서, CSV 필터·쿼리·스트리밍 |
| `backend/tests/integration` | 마이그레이션 계약과 선택적 실제 PostgreSQL 검증 |

프런트엔드 관리자 컴포넌트 테스트는 구현 파일과 같은 기능 폴더에 둔다.

- `components/admin/listening`
- `components/admin/reading`
- `components/admin/responses`
- `components/admin/exports`
- `components/admin/common`

## 주요 검증 범위

프런트엔드는 공개 시험 흐름, 필수 이메일 결과 전달, 결과 토큰 화면, 문제·듣기 UI, 관리자 회차·응답·CSV 화면, 다국어와 브라우저 상태를 검증한다. 관리자 데이터 추출 테스트에는 문항 정답률 안내, 미응답 필터, CSV 다운로드, 세션 이메일 원문 경고가 포함된다.

백엔드는 공개 API, 결과 이메일 발송과 토큰 보안, 듣기·읽기 관리, 관리자 응답 삭제, 문항 버전 생성, 미디어 삭제, CSV 필터·SQL·인코딩·커서 스트리밍을 검증한다. 제거된 다음 레거시 경로가 모두 `404 NOT_FOUND`인지도 API 테스트에서 확인한다.

- `GET /v1/admin/listening/mock-tests`
- `POST /v1/admin/listening/items/:itemId/versions/:itemVersion/tts`
- `DELETE /v1/admin/listening/items/:itemId/versions/:itemVersion/audio/:audioAssetId`
- `PUT /v1/admin/listening/mock-tests/:mockTestId/publish`

## 실행 방법

프로젝트 루트에서 실행한다.

```powershell
# 전체 테스트
pnpm test

# 프런트엔드 또는 백엔드만 실행
pnpm --filter @unigate/topik-web test
pnpm --filter @unigate/topik-api test

# 정적 검사와 프로덕션 빌드
pnpm typecheck
pnpm build
```

실제 PostgreSQL 통합 테스트까지 실행하려면 백엔드가 접근할 수 있는 `DATABASE_URL`을 설정한다. SSL이 필요한 환경에서는 `DATABASE_SSL=require`도 설정한다. 자격 증명은 저장소나 문서에 기록하지 않는다.

## 사전등록 PostgreSQL 통합 테스트

`tests/integration/preregistration.integration.test.ts`는 생성·삭제를 검증하는 쓰기 테스트이며,
`PREREGISTRATION_TEST_DATABASE_URL`이 있을 때만 실행합니다. 기존 읽기 전용 문제은행 테스트와
별도로, 빈 임시 DB `unigate_preregistration_test`를 준비해야 합니다. DB 이름이 다르거나
`topik_app` 스키마가 이미 있으면 실행을 거부합니다. 테스트가 만든 스키마는 종료 시 제거합니다.

```powershell
$env:PREREGISTRATION_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/unigate_preregistration_test'
corepack pnpm --filter @unigate/topik-api test tests/integration/preregistration.integration.test.ts
Remove-Item Env:PREREGISTRATION_TEST_DATABASE_URL
```

동시 ID 발급과 재시도, KST 날짜 경계, 필터 후 중복 제거, CSV, 개별 삭제·감사 기록의
트랜잭션, 시험 세션 삭제 시 신청 보존을 실제 PostgreSQL에서 확인합니다.

## 마라톤 PostgreSQL 통합 테스트

`tests/integration/marathon.integration.test.ts`는 **폐기 가능한 DB `unigate_marathon_test` 전용**입니다.
현재 문제은행 스키마·문항 데이터와 `001`~`019` 마이그레이션을 적용한 로컬 DB를 준비한 뒤 실행합니다.
테스트는 마라톤 및 연결된 테스트 세션 데이터를 초기화하므로 운영 DB를 지정하면 안 됩니다.
DB 이름과 마라톤 테이블을 검사하며, 연결 변수를 생략하면 건너뜁니다.

```powershell
$env:MARATHON_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/unigate_marathon_test'
pnpm --filter @unigate/topik-api test tests/integration/marathon.integration.test.ts
Remove-Item Env:MARATHON_TEST_DATABASE_URL
```

검증 범위: 3문항 등록 제한과 재시작·영역 전환, 동시 제출·다음 문항·등록 재시도,
활성 시간과 답 변경, 003 등록 통계, 출제 난이도·문항 버전 보존, 듣기 대본 비공개와 음원 보존,
진행 중 응답 및 세트/마라톤/전체 CSV의 미리보기·다운로드 일치.
듣기 파일 URL 발급과 스토리지 삭제는 테스트 대역을 사용하며 외부 파일을 생성하거나 삭제하지 않습니다.

마라톤 출시 시에는 `019_marathon.sql` → 백엔드 → 프런트엔드 순서로 적용합니다.
기존 세트 세션과 001/002 신청 기록은 유지됩니다. CSV에 `source` 및 마라톤 정책 열이 추가되므로
열 번호 기반 외부 분석은 열 이름 기준으로 갱신해야 합니다. 전체 출처는 출처별 행을 함께 반환합니다.
출제 실패(`MARATHON_NO_QUESTIONS`), 등록 차단(`MARATHON_REGISTRATION_REQUIRED`), 저장 오류는
API 오류 코드와 서버 요청 로그로 확인합니다.

## 빌드와 중복 실행 방지

- 백엔드 `tsconfig.build.json`은 `src/**/*.test.ts`, `tests`, `dist`를 명시적으로 제외한다.
- 백엔드 Vitest 명령은 `dist/**`를 제외하므로 기존 빌드 산출물이 있어도 테스트를 중복 탐색하지 않는다.
- 빌드 후 `backend/dist`에는 `*.test.js`가 생성되면 안 된다.
- 프런트엔드와 백엔드 TypeScript 설정은 `noUnusedLocals`, `noUnusedParameters`를 활성화한다.

## 현재 주의사항

- 실제 DB 통합 테스트는 환경 변수에 따라 건너뛰므로 CI에서 문항 은행 무결성을 보장하려면 DB 연결이 있는 별도 작업이 필요하다.
- 브라우저 E2E 테스트는 아직 없으며 사용자 흐름은 jsdom 기반 컴포넌트·페이지 테스트로 검증한다.
- 별도의 커버리지 임계값과 커버리지 리포트 명령은 아직 설정되어 있지 않다.
