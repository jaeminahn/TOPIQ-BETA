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

## 빌드와 중복 실행 방지

- 백엔드 `tsconfig.build.json`은 `src/**/*.test.ts`, `tests`, `dist`를 명시적으로 제외한다.
- 백엔드 Vitest 명령은 `dist/**`를 제외하므로 기존 빌드 산출물이 있어도 테스트를 중복 탐색하지 않는다.
- 빌드 후 `backend/dist`에는 `*.test.js`가 생성되면 안 된다.
- 프런트엔드와 백엔드 TypeScript 설정은 `noUnusedLocals`, `noUnusedParameters`를 활성화한다.

## 현재 주의사항

- 실제 DB 통합 테스트는 환경 변수에 따라 건너뛰므로 CI에서 문항 은행 무결성을 보장하려면 DB 연결이 있는 별도 작업이 필요하다.
- 브라우저 E2E 테스트는 아직 없으며 사용자 흐름은 jsdom 기반 컴포넌트·페이지 테스트로 검증한다.
- 별도의 커버리지 임계값과 커버리지 리포트 명령은 아직 설정되어 있지 않다.
