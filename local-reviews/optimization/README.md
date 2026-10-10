# Unigate-Web 최적화 검토 및 개선 기록

이 문서는 계속 갱신하는 최적화 기록입니다. 현재 `local-reviews/optimization/README.md`와 보안 검토 문서는 Git에서 추적 중이며, 과거 기록의 `.gitignore` 제외 안내는 더 이상 적용되지 않습니다.
보안 취약점과 보안 강화는 [보안 README](../security/README.md)에서 관리합니다.

최종 검토: **2026-10-11 (Asia/Seoul)**, Git revision `921d3bf38507f01f700057b000d32ad7673e7530` + OPT-003 작업 트리 변경.
2026-10-03 기록의 최적화 8건과 운영 문서 2건을 재검토한 뒤, OPT-003의 네 화면 묶음 분리를 구현했습니다.
새 프론트엔드 production build와 로컬 테스트를 실행했습니다. 운영 API·DB·Google 생성 API 호출, 배포 및 마이그레이션 적용은 하지 않았습니다. 번들 크기 전후 비교는 아래에 기록하며 운영 p95·LCP·동시성별 DB 대기시간은 아직 측정하지 않았습니다.

## 현재 판단

- **이미 구현·로컬 검증됨:** 관리자 주기 폴링 제거(OPT-002), 네 화면 묶음 코드 분리(OPT-003), 이미지·TTS 생성 제한시간과 취소(OPT-007), 미디어 정리 큐·worker 제거 및 직접 삭제(OPT-010).
- **대상 소멸로 종료:** 마라톤 후보 전체 조회(OPT-001). 성능 개선이 아니라 현재 런타임에서 기능이 제거된 상태입니다.
- **추가 최적화 필요:** 로고 경량화(OPT-004), 제출 INSERT 배치화(OPT-005), 시험 음원 URL 서명 전 DB 연결 반환(OPT-006), 접힌 오답 상세 지연 마운트(OPT-008).
- **후순위 신규 후보:** 관리자 비활성 탭의 초기 조회와 생성 건별 전체 목록 재조회 축소(OPT-009). 제거된 주기 폴링과는 별개입니다.
- **문서 정합성은 미완료:** `topik_bank` 불변 설명(OPS-001), TTS 전용 IAM 설명(OPS-002)이 아직 실제 코드와 맞지 않습니다.

`구현·로컬 검증됨`은 아래 테스트와 코드에서 동작을 확인했다는 뜻이며 운영 배포·DB 적용·실측 성능 완료를 뜻하지 않습니다.

## 개선 상태

| ID | 항목 | 현재 상태 | 다음 작업 / 확인할 지표 |
| --- | --- | --- | --- |
| OPT-001 | 마라톤 전체 문제·응답 통계 재조회 | 대상 소멸로 종료 | 현재 개선 대상에서 제외. 기능 재도입 시 후보·통계 조회 설계 재검토 |
| OPT-002 | 관리자 중복·유휴 주기 폴링 | 구현·로컬 검증됨 | 운영 Network에서 유휴 요청 확인. 남은 초기·생성 후 조회는 OPT-009로 분리 |
| OPT-003 | 화면별 코드 분리 | 구현·로컬 검증됨 | 초기 JS gzip 합계 160.04 → 약 111.34 kB. 운영 첫 방문 LCP는 미측정 |
| OPT-004 | 헤더 로고 크기 | 미수정 | 표시 크기에 맞는 이미지·포맷, width/height. 실제 전송량과 선명도 확인 |
| OPT-005 | 시험 제출 순차 INSERT | 미수정 | 배치 INSERT 또는 INSERT…SELECT. 쿼리 수·트랜잭션 시간·제출 p95 비교 |
| OPT-006 | Storage 서명 대기 중 DB 연결 점유 | 미수정: 시험 경로 잔존 | 서명 전에 연결 반환. 느린 Storage에서 pool 점유·대기시간 확인 |
| OPT-007 | 생성 요청·FFmpeg 작업 시간 상한 | 구현·로컬 검증됨 | 실제 프록시 제한시간과 대표 TTS 생성 소요시간 확인 |
| OPT-008 | 접힌 오답 상세 렌더링 | 미수정 | 최초 펼침 시 상세 마운트. 마운트 수·이미지 요청·접근성 확인 |
| OPT-009 | 관리자 비활성 탭 및 생성 건별 전체 조회 | 신규·미수정 / 후순위 | 탭별 조회와 목록 갱신 범위 축소. 진입·N건 생성 시 요청·집계 수 비교 |
| OPT-010 | 미디어 정리 큐·worker 제거 | 구현·로컬 검증됨 | 적용 시 022 마이그레이션 필요. 운영 적용 여부는 이번 검토에서 확인하지 않음 |

## 남은 최적화: 우선순위와 근거

아래 순서는 코드에서 확인한 비용·사용 경로와 변경 범위에 따른 제안입니다. 실측 병목 순위는 아닙니다. 새 테이블이나 큐를 추가하지 않고 진행할 수 있는 변경을 우선합니다.

### 1. OPT-004 — 작은 헤더에 큰 원본 로고 사용

- 근거: `frontend/public/logo.png`는 **591,274바이트(약 577.4 KiB), 1945×808**입니다. PNG 헤더와 파일 크기로 재확인했습니다.
- `frontend/src/components/Header.tsx:11`은 `/logo.png`를 높이 32–36px로 표시하며 width/height 속성이 없습니다.
- 권장: 실제 표시 크기의 2x/3x 자산과 WebP/AVIF, 또는 이용 가능한 원본 SVG를 사용합니다. 이미지 비율과 명시적 크기를 유지합니다.
- 판단: 작은 변경 범위로 첫 방문 이미지 전송량을 줄일 수 있어 먼저 처리하기 좋습니다. 로고가 실제 LCP 요소인지는 측정 전입니다.

### 2. OPT-005 — 제출 시 문항 수만큼 순차 INSERT

- 근거: `backend/src/exam/repository.ts:123`의 `finalizeInTransaction()`은 각 문항마다 `await client.query(INSERT …)`를 실행합니다. 50문항이면 관측치 저장에만 50회 순차 INSERT입니다.
- IRT·풀이 시간 수집 제거로 저장 필드는 줄었지만 이 반복 쿼리는 남아 있습니다.
- 권장: 배치 INSERT 또는 INSERT…SELECT로 통합합니다. 점수 계산까지 변경 범위를 넓힐 필요는 없습니다.
- 보존 기준: `ON CONFLICT (session_id,item_order) DO NOTHING`, 수동·만료 제출, 미응답의 `skipped`/`timed_out`, 점수와 동시 제출의 멱등성.
- 검증: 격리 DB에서 50문항 제출 쿼리 수와 트랜잭션 시간, 동일 동시성에서 제출 p95를 비교합니다.

### 3. OPT-006 — 시험 음원 URL 서명 중 연결을 반환하지 않음

- 근거: `backend/src/exam/repository.ts:473`에서 COMMIT한 뒤 `:474`에서 `signedAudioUrl()`을 기다리고, `:516`의 finally에서 연결을 반환합니다. **트랜잭션 잠금은 이미 해제되지만 pool 연결은 계속 점유합니다.**
- `backend/src/core/db.ts:8`의 pool 최대값은 production 10, 그 외 4입니다. DB의 15초 statement timeout은 외부 Storage 응답 대기를 제한하지 않습니다.
- 권장: DB 검증·경로 조회·COMMIT 후 연결을 반환하고, 그 다음 제한시간을 둔 Storage URL 서명을 수행합니다. COMMIT 이후 외부 오류를 DB ROLLBACK 경로로 보내지 않도록 경계를 나눕니다.
- 보존 기준: 세션 소유권, 세션 상태, timed 모드 재생 횟수, 자산 삭제 경쟁 조건과 URL 수명. 느린 서명 응답 대역으로 연결이 먼저 반환되는지 확인합니다.
- 기존 마라톤 URL 발급 경로는 기능 제거로 사라졌습니다. 시험 경로가 남아 있으므로 이 항목 전체를 완료 처리하지 않습니다.
- 별도 관찰: `backend/src/media/generation.ts:13`은 생성 중 세션 advisory lock을 유지하려고 연결을 점유합니다. 이미지 생성의 바인딩에는 추가 연결도 필요합니다. 이는 현재 중복 생성 방지 설계에 따른 점유이므로 잠금 연결을 임의로 반환하면 안 됩니다. TTS·이미지 각 1건 제한을 유지한 채 실제 pool 경합이 나타날 때만 후속 검토합니다.

### 4. OPT-008 — 접힌 오답도 QuestionCard를 모두 마운트

- 근거: `frontend/src/components/results/IncorrectReview.tsx:35`는 모든 오답의 `QuestionCard`와 해설을 렌더링하며 `aria-hidden`과 CSS로 접습니다. 상세 내용의 조건부 마운트는 없습니다.
- `frontend/src/components/question/QuestionContent.tsx:67`, `QuestionChoices.tsx:41`의 이미지에도 `loading="lazy"`가 없습니다.
- 권장: 처음 펼쳤을 때 상세를 마운트하고, 필요하면 한 번 연 내용은 유지합니다. 화면 밖 이미지의 lazy loading도 검토합니다.
- 보존 기준: `aria-expanded`/`aria-controls`, 키보드 조작, 유형 요약에서 문항으로 이동, 펼침 애니메이션과 해설 열람 이벤트.
- 검증: 오답 50개 기준 초기 상세 마운트·이미지 요청 수, 처음 펼침 지연을 비교합니다.

### 5. OPT-009 — 관리자 최초 조회와 생성 후 갱신 범위

- 근거: `frontend/src/pages/admin/AdminPage.tsx:53`은 로그인 후 선택 탭과 무관하게 dashboard·듣기 세트·읽기 세트를 가져옵니다. `:69`의 `useAdminResponses()`도 `frontend/src/components/admin/responses/useAdminResponses.ts:43`에서 응답 목록을 즉시 조회합니다.
- `frontend/src/components/admin/common/useSequentialGeneration.ts:39`는 생성 1건마다 refresh를 기다립니다. 듣기는 `ListeningAdminPanel.tsx:153`, 읽기는 `ReadingAdminPanel.tsx:93` 등에서 문항 목록과 세트 목록을 다시 조회합니다. 정상적인 N건 배치에서는 이 두 조회가 건별로 반복됩니다.
- dashboard에는 `backend/src/admin/repositories/overview-repository.ts:7`의 여러 COUNT 집계가 남아 있습니다. 주기 호출은 제거됐으므로 기존 폴링 시절의 부하로 평가하면 안 됩니다.
- 권장: 탭 진입 시 필요한 데이터만 조회하고, 생성 성공 응답으로 해당 자산을 갱신하거나 세트 집계를 배치 종료 시 모아 갱신합니다. 먼저 현재 N건 생성 요청 수를 측정하고 관리자 이용량에 비례해 우선순위를 정합니다.
- 보존 기준: 응답 유실 시 이미 저장된 자산을 재조회해 중복 유료 생성을 막는 동작, 선택 세트 변경 후 오래된 응답 무시, 수동 새로고침.

## 이미 반영된 개선과 종료 항목

### OPT-001 — 마라톤 비용은 현재 런타임에서 제거됨

- `backend/src/marathon/`, `frontend/src/pages/MarathonPage.tsx`가 현재 소스에 없고, App과 공개 API에 마라톤 경로가 없습니다. 런타임 소스 검색에서도 관련 기능을 찾지 못했습니다.
- 과거 inventory 전체 조회·paired 그룹 반복 필터링·마라톤 잠금 안의 URL 서명은 현재 최적화 작업에서 제외합니다.
- 종료 사유를 “쿼리 최적화 완료”로 기록하지 않습니다. 기능 복귀 시 기존 정책·개인 노출 횟수 보존 기준을 다시 적용합니다.

### OPT-002 — 관리자 주기 폴링 제거

- `frontend/src/pages/admin/AdminPage.tsx:91`은 초기 load만 수행하고 생성 작업 큐 폴링은 없습니다. 듣기·읽기 패널에도 기존 1초/4초 주기 조회가 없습니다.
- 직접 생성 API와 `useSequentialGeneration()`이 생성 결과를 기다리고 작업 후 목록을 갱신합니다. 소스 변경은 `2f35e6e`에 반영됐습니다.
- `ListeningAdminPanel.test.tsx`의 주기 폴링 미생성 테스트를 포함해 관리자 관련 3개 파일, **27개 테스트 통과**.
- 남은 초기/건별 전체 조회는 OPT-009이며, 숨긴 탭용 폴링 중지 기능을 별도로 만들 이유는 없습니다. 운영 1분 Network 측정은 미실시입니다.

### OPT-003 — 홈·시험·결과·관리자 네 묶음으로 분리

- 기존 `pages/`의 6개 페이지와 5개 페이지 테스트를 `home/`, `exam/`, `results/`, `admin/`으로 이동했습니다. 각 폴더에 묶음 진입점 `index.ts`를 두며 공통 components/hooks는 기존 위치를 유지합니다.
- `App.tsx`는 홈만 정적 import합니다. 시험과 답안 검토는 같은 exam 모듈, 설문·이메일과 결과는 같은 results 모듈, 관리자는 admin 모듈을 `React.lazy()`로 가져옵니다. 상위 페이지 barrel이나 강제 수동 청크 설정은 없습니다.
- `PageBoundary.tsx`는 Suspense 로딩 표시와 오류 경계를 제공합니다. 한·영 화면 로딩 문구를 추가했고 다운로드 실패 시 현재 URL 새로고침과 홈 이동을 제공하며 자동 새로고침은 하지 않습니다.
- 관리자 API가 홈 공통 청크에 포함되는 것을 방지하기 위해 관리자 코드·테스트는 `api/adminApi`를 직접 import하고, `api.ts`의 관리자 API 재내보내기를 제거했습니다. 서버 API 계약에는 변경이 없습니다.
- build manifest의 정적 import를 재귀적으로 추적했습니다. 초기 로드는 `index`와 공유 `request` 두 JS 청크이며, 시험·결과·관리자 진입점은 dynamic import입니다.
- 임시 공개 설정값으로 Supabase 활성 빌드도 별도 생성하고 sourcemap의 실제 소스 목록을 검사했습니다. Supabase 모듈 37개와 관리자 API는 admin 청크에만 있으며 초기 청크에는 다른 페이지/관리자 컴포넌트/Supabase 소스가 없습니다. 실제 인증 요청은 호출하지 않았습니다.
- `App.test.tsx`와 `PageBoundary.test.tsx`에서 홈의 다른 묶음 미로드, 모든 기존 URL 직접 진입, 시험→검토→설문 이동, hash 토큰·구형 URL 리다이렉트, 한·영 로딩 및 실패 후 수동 재시도·홈 이동을 확인했습니다. 기존 화면 테스트를 포함해 프론트엔드 전체 33개 파일·149개 테스트와 타입 검사를 포함한 production build가 통과했습니다.

```text
frontend/src/pages/
├─ home/     index.ts, LandingPage.tsx, LandingPage.test.tsx
├─ exam/     index.ts, TestPage.tsx, ReviewPage.tsx, TestPage.test.tsx
├─ results/  index.ts, FeedbackPage.tsx, ResultsPage.tsx, 각 페이지 테스트
└─ admin/    index.ts, AdminPage.tsx, AdminPage.test.tsx
```

```tsx
// 이전: import { TestPage } from "./pages/TestPage";
// 변경: 해당 화면 진입 때만 시험 묶음을 다운로드
const TestPage = lazy(() =>
  import("./pages/exam").then(module => ({ default: module.TestPage }))
);
```

| 구분 | JS 원본 kB | gzip kB (Vite 출력) | 로딩 시점 |
| --- | ---: | ---: | --- |
| 변경 전 전체 초기 JS | 543.40 | 160.04 | 첫 진입 |
| 변경 후 홈 진입점 | 218.30 | 68.35 | 첫 진입 |
| 변경 후 공통 request 청크 | 125.54 | 42.99 | 첫 진입 |
| **변경 후 초기 JS 합계** | **343.84** | **약 111.34** | **공통 청크 포함, gzip 약 30.4% 감소** |
| exam 진입 청크 | 22.64 | 6.85 | 시험·답안 검토 진입 |
| results 진입 청크 | 20.15 | 6.06 | 설문·결과 진입 |
| admin 진입 청크 | 137.66 | 34.84 | 관리자 진입, 기본 로컬 빌드 |
| admin 진입 청크 (Supabase 설정 시) | 346.73 | 88.58 | 별도 인증 SDK 포함 검증 빌드 |

동일한 Vite gzip 출력 기준으로 전후를 비교했습니다. 각 지연 화면은 위 진입 청크 외에 QuestionCard·survey 등 필요한 공유 청크도 추가 로드합니다. 실제 JS 파일은 9개이며 기능 묶음 수를 파일 수와 혼동하지 않습니다. 관리자 탭 추가 분리나 사전 다운로드는 적용하지 않았습니다. 이 수치는 JS 전송량 기준이며 CSS·로고·API 응답과 실제 CDN 전송/LCP 개선율을 포함하지 않습니다.

### OPT-007 — 이미지·TTS 생성 제한시간 및 취소 구현

- `backend/src/core/config.ts:36`의 `MEDIA_GENERATION_TIMEOUT_MS` 기본값은 **240,000ms**, 허용 범위는 1,000–900,000ms입니다.
- `backend/src/media/generation.ts:18`에서 AbortController를 중단합니다. Google TTS(`google-tts.ts:134`)와 이미지(`google-image.ts:98`)의 인증·fetch, Storage 업로드에 signal을 전달합니다.
- `backend/src/listening/audio-composer.ts:128`은 취소 시 FFmpeg에 SIGKILL을 보내고 close를 기다립니다. `:183`의 finally에서 임시 디렉터리를 정리합니다.
- 생성 잠금은 finally에서 해제하고, 해제 실패 연결은 폐기합니다. 중복 생성은 유형별 1건으로 제한합니다. 생성 큐가 없어졌으므로 과거 작업 상태/lease 재수거 과제는 현재 기준에서 제외합니다.
- 취소·FFmpeg 종료 순서·provider signal·연결 반납 관련 로컬 테스트 통과. 실제 Google/Storage 장애와 배포 프록시 제한시간, 실제 OS 자식 프로세스 종료까지 검증했다는 의미는 아닙니다. 제한시간은 취소 요청의 기준이며 모든 정리 작업까지 포함한 정확한 HTTP 응답 상한은 아닙니다.
- 자동 재시도 추가는 현 요구사항이 아닙니다. 수동 재시도 전에 저장 결과를 확인하는 기존 동작을 유지합니다.

### OPT-010 — 미디어 cleanup 큐·worker 제거

- `921d3bf`에서 cleanup queue/worker 모듈과 서버의 주기 실행을 제거했습니다. `backend/src/server.ts`에는 메일 worker만 남아 있습니다.
- `backend/src/media/cleanup.ts:9`를 이미지 바인딩과 TTS 생성의 COMMIT 이후 같은 요청에서 호출합니다. 현재 참조·공유 경로를 확인하고 Storage 삭제 성공 후 DB 자산/바인딩을 정리합니다. 재생 이력이 있는 음원은 삭제 표시된 자산 행을 유지합니다.
- Storage 삭제 실패 시 이전 자산·바인딩을 유지하고 새 미디어 교체는 성공 처리합니다. 서버 로그만 남기며 **추가 큐·로그 테이블과 자동 재시도는 없습니다.** 이 정책은 사용자의 단순화 요구사항입니다.
- `022_remove_media_cleanup_jobs.sql:3`은 큐 테이블만 DROP하며 자산 테이블이나 Storage 파일을 삭제하지 않습니다. 과거 마이그레이션은 그대로 유지합니다.
- 비용 이동: 15초 주기 DB polling이 없어지는 대신 교체 요청에서 삭제 시간을 기다립니다. 삭제 Storage 호출에는 10초 timeout이 있습니다. 트랜잭션/DB 실패와 원격 삭제는 원자적이지 않으므로 모든 장애에서 파일 복구까지 보장하는 것은 아닙니다.
- 이미지·음성 삭제 실패, 현재/공유 자산 보호, 재생 이력 보존 테스트 통과. 이번 검토에서 운영 DB에 022가 적용됐는지는 확인하지 않았습니다.

## 이번 검증 결과와 측정 기준값

| 검증 | 2026-10-11 결과 | 범위와 한계 |
| --- | --- | --- |
| 프론트엔드 production build | 성공, 초기 JS 2개 합계 343.84 kB / gzip 약 111.34 kB | `index-DzVaY76A.js` + `request-BpAwB_bs.js`. 전체 JS는 공유·지연 청크 포함 9개. 실제 CDN·Brotli·캐시·LCP 측정 아님 |
| CSS / HTML | CSS 58.59 kB / gzip 11.89 kB, HTML 2.79 kB / gzip 1.13 kB | 같은 빌드 산출물 기준, kB는 Vite 표기 |
| 헤더 로고 | 591,274바이트, 1945×808 PNG | 로컬 원본 크기. 최초 HTTP 전송량과 캐시 적중은 미확인 |
| 백엔드 관련 테스트 | 5개 파일, 40개 통과 | media-generation, audio-cancellation, media-cleanup, google-tts, google-image. provider/Storage 및 자식 프로세스 등 대역 사용 |
| 프론트엔드 전체 테스트 (OPT-003 구현 후) | 33개 파일, 149개 통과 | 페이지 이동·지연 로딩 테스트와 기존 시험·결과·관리자·이탈 방지 테스트 포함. Vitest/jsdom이며 브라우저 성능 실측 아님. 기존 canvas 대역 미지원 경고는 있으나 실패 없음 |
| 운영 DB / API / IAM | 실행·조회하지 않음 | SQL 실행계획, pool 대기, 제출 p95, 배포·마이그레이션 상태 확인 전 |

재현 명령:

```powershell
pnpm --filter @unigate/topik-web build
pnpm --filter @unigate/topik-api exec vitest run tests/unit/media-generation.test.ts tests/unit/audio-cancellation.test.ts tests/unit/media-cleanup.test.ts tests/unit/google-tts.test.ts tests/unit/google-image.test.ts --pool=threads --maxWorkers=1
pnpm --filter @unigate/topik-web test
```

다음 성능 비교는 같은 환경·데이터량·동시성에서 실시합니다. OPT-003/004는 첫 방문 Network·청크 크기, OPT-005/006은 격리 DB와 지연 Storage 대역, OPT-008/009는 마운트 수·요청 수를 먼저 측정합니다. 현재 기록에는 측정하지 않은 개선율을 기재하지 않습니다.

## 운영 문서 정합성

| ID | 현재 확인된 차이 | 필요한 작업 | 상태 |
| --- | --- | --- | --- |
| OPS-001 | README 25행은 `topik_bank`를 변경하지 않는 문제은행으로, 124행은 마이그레이션이 `topik_app`만 수정한다고 설명합니다. 그러나 016은 `topik_bank` ALTER/DELETE/DROP, 020은 컬럼 삭제·뷰 재생성을 수행합니다. README 뒤의 IRT 제거 안내에는 변경 내용이 추가돼 있으나 앞 설명과 모순됩니다. | 앞쪽 개요·설치 안내를 실제 마이그레이션 대상으로 정정하고 뒤의 백업·복구/호환 배포 설명과 연결 | 일부 상세 문서 추가됨, 모순 해소는 미완료 |
| OPS-002 | README 108행은 서비스 계정에 TTS 합성 권한만 부여한다고 설명합니다. `google-image.ts:101`도 같은 자격 증명으로 Vertex 이미지를 호출합니다. | TTS·Vertex 사용을 함께 설명하고 실제 운영 IAM 최소 권한은 별도로 확인 | 문서 미수정·운영 확인 필요. IAM 오설정을 확인한 것은 아님 |

추가 문서 잔여: `backend/src/README.md:9`의 listening worker 설명도 현재 직접 생성 구조와 맞지 않습니다. OPS-001/002와 함께 문서 정리 시 수정할 수 있습니다.

## 지속 관리 방법

1. 기존 OPT/OPS ID를 유지합니다. 상태는 `미수정 → 진행 중 → 구현·로컬 검증됨 → 운영 측정 완료`로 구분하며 기능 제거는 `대상 소멸로 종료`로 기록합니다.
2. 구현과 운영 적용 여부, 소스 근거와 실측 효과를 분리합니다. 실제 성능을 측정하지 않고 개선율을 추정해 기록하지 않습니다.
3. 완료 항목을 새 구조에 맞지 않는 과거 권장사항으로 되돌리지 않습니다. 특히 미디어 큐·로그 테이블·자동 재시도를 다시 도입하지 않습니다.
4. 수정 커밋과 기능 보존 테스트, 동일 조건에서의 전후 수치를 남깁니다. 새 항목은 반복 작업/자원 점유 근거와 측정 방법을 함께 기록합니다.
5. 현재 검토 문서는 Git에서 추적합니다. 기록 변경을 공유·보존하려면 기능 변경과 구분해 검토하고 커밋합니다.

## 변경 이력

| 날짜 | 대상 | 작업 및 결과 | 기준 커밋 / 검증 |
| --- | --- | --- | --- |
| 2026-10-03 | 최초 검토 기록 | 최적화 8건과 운영 문서 2건 정리. 모두 미수정 또는 확인 대기 | `78293554acd810323b4413b2a95b89a483ddc9f3` / 정적 검토, 성능 측정 전 |
| 2026-10-11 | OPT-001~008, OPS-001~002 재검토 | 마라톤 대상 소멸, 폴링 제거·생성 취소 구현 확인. 나머지 5개 최적화와 문서 불일치는 잔존. 근거 위치와 우선순위 갱신 | `921d3bf38507f01f700057b000d32ad7673e7530` / 새 frontend build, 관련 backend 40·frontend 27 테스트 통과 |
| 2026-10-11 | OPT-009~010 추가 | 관리자 초기·건별 재조회 후보 분리, 미디어 큐·worker 제거와 실패 시 보존 정책 기록 | 직접 생성 `2f35e6e`, 직접 삭제 `921d3bf` / 운영 적용 여부·실측 지연 미확인 |
| 2026-10-11 | OPT-003 구현 | 페이지·테스트를 네 폴더로 이동, lazy/Suspense·오류 경계 적용, 관리자 API 의존성 분리. 초기 JS gzip 약 30.4% 감소 | `921d3bf` 위 작업 트리 / 타입 검사·production build·전체 프론트엔드 149개 테스트 통과, manifest 및 Supabase 활성 빌드 소스 목록 확인 |

추가 기록 양식:

```text
날짜:
항목 ID:
상태:
변경 내용:
수정 커밋:
측정 환경 / 데이터 / 동시성:
개선 전후 수치:
기능 검증 결과:
운영 적용 확인:
남은 조건:
```
