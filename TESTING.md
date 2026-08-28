# UNIGATE TOPIK 테스트 가이드

이 문서는 2026-08-27 기준 테스트 구성, 실행 방법, 검증 범위를 정리한다.

## 테스트 현황

Git에 포함된 소스 기준으로 **32개 테스트 파일, 100개 테스트 케이스**가 있다.

| 영역 | 파일 수 | 테스트 수 | 실행 환경 |
| --- | ---: | ---: | --- |
| 프런트엔드 | 21 | 57 | Vitest + jsdom + Testing Library |
| 백엔드 | 11 | 43 | Vitest + Fastify inject + PostgreSQL 선택 연동 |
| 합계 | **32** | **100** | |

최근 검증 결과는 다음과 같다.

- 프런트엔드: 21개 파일, 57개 테스트 모두 통과
- 백엔드: 45개 통과, 1개 건너뜀
- 건너뛴 테스트: `DATABASE_URL`이 없을 때 실행하지 않는 실제 PostgreSQL 문항 은행 통합 테스트

> [!NOTE]
> 백엔드 빌드 후 `backend/dist`가 남아 있으면 `src/admin-repository.test.ts`와 `src/repository.test.ts`에서 컴파일된 테스트 3개가 다시 탐색된다. 이 경우 고유 테스트는 100개이지만 러너에는 총 103개 실행으로 표시된다. `dist`를 제거한 깨끗한 환경에서는 백엔드 고유 테스트가 43개다.

## 테스트 종류

### 프런트엔드

| 분류 | 테스트 수 | 주요 검증 내용 |
| --- | ---: | --- |
| 공개 페이지와 시험 흐름 | 9 | 랜딩 선택 폼, 세션 재개·재시작, 시험 시간, 결과 저장과 다국어 표시 |
| 문제 UI와 듣기 재생 | 20 | 읽기 18개 유형 렌더링, 공통 지문·듣기, 선택지, 대본 노출, 오디오 자동 재생과 전환 |
| 관리자 UI | 12 | 읽기·듣기 회차 관리, 응답 상세, 문항 수정, 공개·비공개 처리 |
| API·세션·브라우저 상태 | 11 | API 요청 계약, 재시도 중복 방지, 활성 세션과 완료 결과 저장, 이탈 방지, 활성 시간 집계 |
| 다국어와 도메인 헬퍼 | 5 | 언어 복원, 회차 그룹화·정렬, 문제 유형 라벨 |
| 합계 | **57** | |

프런트엔드 테스트는 다음 성격을 함께 가진다.

- **단위 테스트:** 회차 정렬, 라벨 변환, 로컬 스토리지 및 시간 계산처럼 독립된 로직을 검증한다.
- **컴포넌트 테스트:** React 컴포넌트를 jsdom에 렌더링하고 사용자 클릭·선택·키보드 동작과 접근성을 검증한다.
- **페이지 흐름 테스트:** API를 모킹하고 랜딩 → 세션, 시험, 결과, 관리자 화면의 상태 전환을 검증한다.

### 백엔드

| 분류 | 테스트 수 | 주요 검증 내용 |
| --- | ---: | --- |
| 공개 API와 도메인 | 11 | 상태 확인, 시험 목록, 제출·피드백·오디오 API, 입력 정규화, 답안 정보 비노출, 세션 포기 |
| 듣기 안전성과 미디어 | 10 | 응시 중 대본 보호, 결과 대본, Gemini TTS 요청, 이미지 생성 요청·응답·안전 차단·차트 렌더링 |
| 관리자와 저장소 | 13 | 읽기·듣기 세트 등록, 중복 방지, 트랜잭션 롤백, 응답 상세, 문항 버전 생성, 미디어 삭제 순서 |
| DB 계약과 통합 | 9 | 마이그레이션 체크섬·스키마 계약 8개, 실제 PostgreSQL 문항 은행 통합 테스트 1개 |
| 합계 | **43** | |

백엔드 테스트는 다음 성격을 함께 가진다.

- **단위 테스트:** 도메인 함수, 요청 생성, 응답 정제와 이미지·TTS 변환을 검증한다.
- **API 테스트:** Fastify `inject`로 실제 서버 라우트를 호출하되 저장소와 외부 서비스는 모킹한다.
- **저장소 테스트:** PostgreSQL 클라이언트를 모킹해 SQL 호출, 트랜잭션, 버전 생성과 롤백 순서를 검증한다.
- **계약 테스트:** 마이그레이션 파일이 필수 테이블·컬럼·인덱스와 고정 세트를 정의하는지 검증한다.
- **DB 통합 테스트:** `DATABASE_URL`이 있을 때 실제 문항 은행에 50문항 읽기 세트 2개가 완전하게 존재하는지 확인한다.

## 실행 방법

프로젝트 루트에서 실행한다.

```powershell
# 프런트엔드와 백엔드 전체 테스트
pnpm test

# 프런트엔드만 실행
pnpm --filter @unigate/topik-web test

# 백엔드만 실행
pnpm --filter @unigate/topik-api test

# 전체 타입 검사
pnpm typecheck

# 전체 프로덕션 빌드
pnpm build
```

실제 PostgreSQL 통합 테스트까지 포함하려면 백엔드가 접근할 수 있는 `DATABASE_URL`을 설정한다. SSL이 필요한 환경에서는 `DATABASE_SSL=require`도 함께 설정한다. 자격 증명은 저장소나 문서에 기록하지 않는다.

## 파일별 테스트 수

### 프런트엔드

| 파일 | 수 |
| --- | ---: |
| `pages/LandingPage.test.tsx` | 4 |
| `pages/TestPage.test.tsx` | 3 |
| `pages/ResultsPage.test.tsx` | 2 |
| `pages/AdminPage.test.tsx` | 2 |
| `components/QuestionCard.test.tsx` | 9 |
| `components/QuestionGroup.test.tsx` | 2 |
| `components/QuestionNavigatorDialog.test.tsx` | 2 |
| `components/ListeningAudioPlayer.test.tsx` | 5 |
| `components/ExitConfirmationDialog.test.tsx` | 2 |
| `components/admin/ReadingAdminPanel.test.tsx` | 4 |
| `components/admin/ListeningAdminPanel.test.tsx` | 3 |
| `components/admin/AdminResponsesPanel.test.tsx` | 2 |
| `components/admin/AdminQuestionEditorDialog.test.tsx` | 1 |
| `hooks/useExitGuard.test.tsx` | 1 |
| `hooks/useActiveTime.test.tsx` | 2 |
| `api.test.ts` | 4 |
| `activeSessions.test.ts` | 2 |
| `completedResults.test.ts` | 2 |
| `examRounds.test.ts` | 2 |
| `questionTypeLabels.test.ts` | 2 |
| `i18n.test.tsx` | 1 |

### 백엔드

| 파일 | 수 |
| --- | ---: |
| `tests/app.test.ts` | 6 |
| `tests/domain.test.ts` | 4 |
| `tests/listening.test.ts` | 4 |
| `tests/google-image.test.ts` | 6 |
| `tests/admin-reading.test.ts` | 4 |
| `tests/admin-reading-api.test.ts` | 2 |
| `tests/admin-listening-sets.test.ts` | 5 |
| `tests/migration.contract.test.ts` | 8 |
| `tests/question-bank.integration.test.ts` | 1 |
| `src/repository.test.ts` | 1 |
| `src/admin-repository.test.ts` | 2 |

## 현재 주의사항

- 기본 Vitest 검색 범위가 `backend/dist`를 제외하지 않아 빌드 후 백엔드 테스트 3개가 중복 실행될 수 있다.
- PostgreSQL 통합 테스트는 환경 변수에 따라 건너뛰므로, CI에서 문항 은행 무결성을 보장하려면 DB 연결이 있는 별도 통합 테스트 작업이 필요하다.
- 브라우저 E2E 도구를 사용하는 테스트는 현재 없다. 현재 프런트엔드 사용자 흐름은 jsdom 기반 컴포넌트·페이지 테스트로 검증한다.
- 별도의 커버리지 임계값이나 커버리지 리포트 명령은 현재 설정되어 있지 않다.
