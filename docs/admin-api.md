# 관리자 API 명세

## 목차

- [공통 호출 규칙·인증·호환 경로](#common)
- [로그인·관리자 정보](#auth)
- [대시보드·이메일 설정](#overview)
- [읽기·듣기 세트·문항·공개·버전](#content)
- [TTS 작업·음원](#tts)
- [이미지 업로드·생성·삭제](#visual)
- [시험 응답 조회·삭제](#responses)
- [마라톤 관리](#marathon)
- [사전등록 관리](#preregistration)
- [데이터 내보내기](#exports)
- [내보내기 필터](#export-filters)
- [CSV 형식과 컬럼](#csv-format)
- [응답 데이터 구조](#models)
- [공통 오류](#errors)

기능별 표에서 개별 엔드포인트 설명으로 이동할 수 있습니다. 기준: 2026-10-07 저장소 코드. 실제 운영 배포 상태를 확인한 문서는 아닙니다.

<a id="common"></a>
## 공통 호출 규칙·인증·호환 경로

- 기본 주소 `http://localhost:4000`. 운영에서는 백엔드 주소로 교체합니다.
- 로그인 외에는 `Authorization: Bearer ADMIN_TOKEN`이 필수입니다. Supabase 사용자 인증 후 활성 관리자 테이블 등록 여부도 검사합니다. 일반 시험 토큰으로 대체할 수 없습니다.
- JSON 본문은 `Content-Type: application/json`. UUID·토큰·샘플 데이터는 설명용이므로 실제 조회·발급 값으로 교체합니다.
- curl 예시는 Bash 문법입니다. PowerShell에서는 `curl.exe`와 JSON 파일의 `--data-binary @request.json` 사용이 가능합니다.
- 경로의 `setId`, `itemId`, `leaderItemId`, `mockTestId`, `sessionId`, `audioAssetId`, `visualAssetId`는 UUID. `itemVersion`은 양의 정수, `optionNumber`는 정수 1~4입니다.
- 전역 IP당 1분 240회, 로그인은 IP당 15분 5회. JSON 최대 6 MiB, 업로드 파일 1개·5 MiB.
- `versions/:setVersion`을 포함한 세트 경로는 호환 별칭입니다. 등록·공개·문항 수정 경로에서는 setVersion을 양의 정수로 검증하지만 처리에는 사용하지 않습니다. TTS·음원 삭제·세트 이미지 생성 경로에서는 setVersion을 별도로 파싱하지 않습니다. 모두 세트의 현재 구성을 처리하므로 과거 세트 버전 조회·편집으로 해석하면 안 됩니다.
- TTS·이미지의 202는 비동기 작업 접수입니다. 완료·실패는 TTS 작업 목록과 읽기·듣기 문항 조회에서 확인합니다. TTS_WORKER_ENABLED 또는 VISUAL_WORKER_ENABLED가 꺼져 있으면 해당 생성 요청은 503입니다.
- UUID와 날짜는 string, 카운트는 number. 이 문서의 숫자 필드는 저장소의 정수·실수 변환을 기준으로 표시했습니다.

<a id="auth"></a>
## 로그인·관리자 정보

| API | 호출 |
|---|---|
| [관리자 로그인](#admin-1) | `POST /v1/admin/auth/login` |
| [관리자 정보](#admin-2) | `GET /v1/admin/me` |

<a id="admin-1"></a>
### 1. 관리자 로그인

`POST /v1/admin/auth/login`

- 인증: 불필요
- 성공: `200`

본문 필수: `email` 이메일 문자열, `password` 문자열 12~200자.

```bash
curl -X POST "http://localhost:4000/v1/admin/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"example-password-1234"}'
```

응답

```json
{
  "accessToken": "EXAMPLE_ADMIN_TOKEN",
  "expiresAt": 1791334800,
  "admin": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "admin@example.com"
  }
}
```

accessToken은 Supabase Auth 액세스 토큰입니다. expiresAt은 Unix 초(number, 제공자가 생략하면 응답에서 생략 가능). 로그인 제한은 IP당 15분 5회입니다. 별도 refresh/logout 백엔드 경로는 없습니다.

주요 오류: 401 ADMIN_LOGIN_FAILED, 403 ADMIN_FORBIDDEN, 503 AUTH_NOT_CONFIGURED; [공통 오류](#errors) 적용.

<a id="admin-2"></a>
### 2. 관리자 정보

`GET /v1/admin/me`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/me" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { admin: { id: UUID, email: string } }

```json
{
  "admin": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "admin@example.com"
  }
}
```

주요 오류: [공통 오류](#errors) 적용.

<a id="overview"></a>
## 대시보드·이메일 설정

| API | 호출 |
|---|---|
| [관리 현황](#admin-3) | `GET /v1/admin/dashboard` |
| [결과 이메일 기능 설정](#admin-4) | `PUT /v1/admin/email/settings` |

<a id="admin-3"></a>
### 3. 관리 현황

`GET /v1/admin/dashboard`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/dashboard" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { summary: AdminSummary }

```json
{
  "summary": {
    "totalItems": 0,
    "totalVersions": 0,
    "readingVersions": 0,
    "listeningVersions": 0,
    "setCount": 0,
    "mockTestCount": 0,
    "publishedMockTests": 0,
    "audioReady": 0,
    "audioMissing": 0,
    "visualReady": 0,
    "jobsQueued": 0,
    "jobsProcessing": 0,
    "jobsFailed": 0,
    "sessionsToday": 0,
    "responseCount": 0,
    "answeredResponseCount": 0,
    "unansweredResponseCount": 0,
    "emailUsage": {
      "enabled": true,
      "configured": true,
      "cycleStart": "2026-09-11",
      "cycleEnd": "2026-10-11",
      "acceptedCount": 0,
      "pendingCount": 0,
      "limit": 5000,
      "remaining": 5000,
      "warningThreshold": 4990,
      "warningStatus": "not_sent"
    }
  }
}
```

emailUsage의 cycleEnd는 제외 경계입니다. 설정에 따라 발송 한도와 경고 기준이 달라집니다. jobs 계수에는 TTS·이미지 작업이 합산됩니다. sessionsToday는 DB 날짜 기준입니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-4"></a>
### 4. 결과 이메일 기능 설정

`PUT /v1/admin/email/settings`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `enabled` boolean.

```bash
curl -X PUT "http://localhost:4000/v1/admin/email/settings" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"enabled":true}'
```

응답 구조: { enabled: boolean, updatedAt: ISO 문자열 }

```json
{
  "enabled": true,
  "updatedAt": "2026-10-07T00:00:00.000Z"
}
```

주요 오류: [공통 오류](#errors) 적용.

<a id="content"></a>
## 읽기·듣기 세트·문항·공개·버전

| API | 호출 |
|---|---|
| [듣기 문항·음원 그룹 조회](#admin-5) | `GET /v1/admin/listening/items` |
| [듣기 세트 조회](#admin-6) | `GET /v1/admin/listening/sets` |
| [듣기 세트를 모의고사에 등록](#admin-7) | `POST /v1/admin/listening/sets/:setId/register` |
| [듣기 세트를 모의고사에 등록 (호환)](#admin-7) | `POST /v1/admin/listening/sets/:setId/versions/:setVersion/register` |
| [읽기 문항 조회](#admin-8) | `GET /v1/admin/reading/items` |
| [읽기 세트 조회](#admin-9) | `GET /v1/admin/reading/sets` |
| [읽기 세트 공개](#admin-10) | `POST /v1/admin/reading/sets/:setId/publish` |
| [읽기 세트 공개 (호환)](#admin-10) | `POST /v1/admin/reading/sets/:setId/versions/:setVersion/publish` |
| [모의고사 공개 상태 변경](#admin-11) | `PUT /v1/admin/mock-tests/:mockTestId/publish` |
| [문항 버전 이력](#admin-12) | `GET /v1/admin/question-sets/:setId/items/:itemId/versions` |
| [문항 수정본 생성](#admin-13) | `POST /v1/admin/question-sets/:setId/revisions` |
| [문항 수정본 생성 (호환)](#admin-13) | `POST /v1/admin/question-sets/:setId/versions/:setVersion/revisions` |

<a id="admin-5"></a>
### 5. 듣기 문항·음원 그룹 조회

`GET /v1/admin/listening/items`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `setId` UUID, `status` ready/missing/failed.

```bash
curl -X GET "http://localhost:4000/v1/admin/listening/items?status=missing" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { items: AdminListeningGroup[] }

```json
{
  "items": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "positions": [
        1
      ],
      "leaderItemId": "22222222-2222-4222-8222-222222222222",
      "leaderItemVersion": 1,
      "itemType": "dialogue",
      "dialogueTurns": [
        {
          "speaker": "여자",
          "text": "안녕하세요."
        }
      ],
      "questionPrompts": [
        "알맞은 답을 고르십시오."
      ],
      "repeatCount": 1,
      "audioAssetId": null,
      "audioStorageUrl": null,
      "ttsStyle": null,
      "narrationVersion": null,
      "appliedScript": null,
      "audioStatus": "missing",
      "targets": [
        {
          "itemId": "22222222-2222-4222-8222-222222222222",
          "itemVersion": 1,
          "position": 1,
          "itemType": "dialogue",
          "questionPrompt": "알맞은 답을 고르십시오.",
          "stem": "",
          "choices": [
            "보기 1",
            "보기 2",
            "보기 3",
            "보기 4"
          ],
          "correctAnswer": 1,
          "explanation": "해설",
          "contentJson": {},
          "visualOptionCount": 0,
          "visualReadyCount": 0,
          "visualOptions": []
        }
      ],
      "generationJobId": null,
      "generationStatus": null,
      "generationTtsStyle": null,
      "generationScript": null,
      "lastError": null
    }
  ]
}
```

items의 단위는 음원 그룹이며 각 그룹의 targets가 개별 문항입니다. missing 필터는 미연결 및 최신 exam_track_v4 미준비 그룹을 포함합니다. 목록의 audioStatus는 ready/legacy/missing/partial입니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-6"></a>
### 6. 듣기 세트 조회

`GET /v1/admin/listening/sets`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/listening/sets" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { sets: AdminListeningSet[] }

```json
{
  "sets": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "setSequence": 1,
      "createdAt": "2026-10-07T00:00:00.000Z",
      "reviewStatus": "reviewed",
      "publishedAt": "2026-10-07T00:00:00.000Z",
      "itemCount": 50,
      "validItemCount": 50,
      "visualRequired": 0,
      "visualReady": 0,
      "mockTestId": null,
      "slug": null,
      "titleKo": null,
      "mockTestPublished": null,
      "round": null,
      "readyToPublish": false,
      "blockingReasons": [],
      "audioReady": 0,
      "readyToRegister": true
    }
  ]
}
```

readyToRegister는 아직 연결된 모의고사가 없고 검수·발행·50개 유효 문항 조건을 만족할 때 true입니다. readyToPublish는 연결된 모의고사가 있으며 audioReady=50, visualReady≥visualRequired일 때 true입니다. blockingReasons는 세트·문항 조건만 나열하므로 미디어 미준비가 빈 배열과 함께 나타날 수 있습니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-7"></a>
### 7. 듣기 세트를 모의고사에 등록

`POST /v1/admin/listening/sets/:setId/register`

호환 경로: `POST /v1/admin/listening/sets/:setId/versions/:setVersion/register`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/sets/11111111-1111-4111-8111-111111111111/register" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { mockTestId: UUID, slug: string, round: number | null, published: boolean, created: boolean }

```json
{
  "mockTestId": "11111111-1111-4111-8111-111111111111",
  "slug": "listening-1",
  "round": 1,
  "published": false,
  "created": true
}
```

신규 등록은 비공개 상태입니다. 이미 연결된 경우 created:false와 현재 공개 상태를 반환합니다.

주요 오류: 409 LISTENING_SET_NOT_READY, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-8"></a>
### 8. 읽기 문항 조회

`GET /v1/admin/reading/items`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `setId` UUID, `search` 앞뒤 공백 제거 문자열 최대 100자.

```bash
curl -X GET "http://localhost:4000/v1/admin/reading/items" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { items: AdminReadingItem[] }

```json
{
  "items": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "position": 1,
      "mockTestTitle": "읽기 1회",
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "itemType": "grammar",
      "targetLevel": 3,
      "predictedDifficulty": 0.2,
      "reviewStatus": "reviewed",
      "stem": "알맞은 답을 고르십시오.",
      "choices": [
        "보기 1",
        "보기 2",
        "보기 3",
        "보기 4"
      ],
      "correctAnswer": 1,
      "explanation": "해설",
      "contentJson": {},
      "visualOptions": [],
      "materialVisual": null
    }
  ]
}
```

search는 문항 stem 또는 itemType에 대한 부분 검색입니다. SQL ILIKE 패턴의 %와 _가 와일드카드로 해석됩니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-9"></a>
### 9. 읽기 세트 조회

`GET /v1/admin/reading/sets`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/reading/sets" -H "Authorization: Bearer ADMIN_TOKEN"
```

readyToPublish는 연결된 모의고사가 아직 없고 검수·문항·이미지 조건을 만족할 때 true입니다. 기존 모의고사 재공개는 publish API를 직접 사용합니다.

응답 구조: { sets: AdminReadingSet[] }

```json
{
  "sets": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "setSequence": 1,
      "createdAt": "2026-10-07T00:00:00.000Z",
      "reviewStatus": "reviewed",
      "publishedAt": "2026-10-07T00:00:00.000Z",
      "itemCount": 50,
      "validItemCount": 50,
      "visualRequired": 1,
      "visualReady": 1,
      "mockTestId": null,
      "slug": null,
      "titleKo": null,
      "mockTestPublished": null,
      "round": null,
      "readyToPublish": true,
      "blockingReasons": []
    }
  ]
}
```

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-10"></a>
### 10. 읽기 세트 공개

`POST /v1/admin/reading/sets/:setId/publish`

호환 경로: `POST /v1/admin/reading/sets/:setId/versions/:setVersion/publish`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X POST "http://localhost:4000/v1/admin/reading/sets/11111111-1111-4111-8111-111111111111/publish" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { mockTestId: UUID, slug: string, round: number, published: true, created: boolean }

```json
{
  "mockTestId": "11111111-1111-4111-8111-111111111111",
  "slug": "reading-1",
  "round": 1,
  "published": true,
  "created": true
}
```

필요하면 모의고사를 생성하고 공개합니다. 기존 연결을 공개하면 created:false입니다.

주요 오류: 409 READING_SET_NOT_READY / READING_VISUALS_INCOMPLETE, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-11"></a>
### 11. 모의고사 공개 상태 변경

`PUT /v1/admin/mock-tests/:mockTestId/publish`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `published` boolean.

```bash
curl -X PUT "http://localhost:4000/v1/admin/mock-tests/11111111-1111-4111-8111-111111111111/publish" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"published":true}'
```

응답

```json
{
  "published": true
}
```

공개 시 문항 수와 필수 미디어 준비 상태를 검사합니다.

주요 오류: 409 MOCK_TEST_INCOMPLETE / LISTENING_ASSETS_INCOMPLETE / READING_VISUALS_INCOMPLETE, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-12"></a>
### 12. 문항 버전 이력

`GET /v1/admin/question-sets/:setId/items/:itemId/versions`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/question-sets/11111111-1111-4111-8111-111111111111/items/11111111-1111-4111-8111-111111111111/versions" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { setId: UUID, itemId: UUID, position: number, currentVersion: number, versions: AdminQuestionVersion[] }

```json
{
  "setId": "11111111-1111-4111-8111-111111111111",
  "itemId": "22222222-2222-4222-8222-222222222222",
  "position": 1,
  "currentVersion": 1,
  "versions": [
    {
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "itemType": "grammar",
      "targetLevel": 3,
      "predictedDifficulty": 0.2,
      "reviewStatus": "reviewed",
      "stem": "알맞은 답을 고르십시오.",
      "choices": [
        "보기 1",
        "보기 2",
        "보기 3",
        "보기 4"
      ],
      "correctAnswer": 1,
      "explanation": "해설",
      "contentJson": {},
      "createdAt": "2026-10-07T00:00:00.000Z",
      "isCurrent": true
    }
  ]
}
```

문항 버전 내림차순입니다. isCurrent는 해당 세트에서 선택한 버전 여부이며 전체 최신 버전과 다를 수 있습니다.

주요 오류: 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-13"></a>
### 13. 문항 수정본 생성

`POST /v1/admin/question-sets/:setId/revisions`

호환 경로: `POST /v1/admin/question-sets/:setId/versions/:setVersion/revisions`

- 인증: 관리자 액세스 토큰
- 성공: `201`

본문 필수: `revisions` 배열 1~50개. 원소 전체 필수: `position` 정수 1~50, `itemId` UUID, `itemVersion` 양의 정수, `stem` 최대 20,000자, `choices` 문자열 배열 최대 4개·각 최대 5,000자, `correctAnswer` 정수 1~4, `explanation` 최대 20,000자, `contentJson` 임의 JSON 객체.

```bash
curl -X POST "http://localhost:4000/v1/admin/question-sets/11111111-1111-4111-8111-111111111111/revisions" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"revisions":[{"position":1,"itemId":"22222222-2222-4222-8222-222222222222","itemVersion":1,"stem":"수정한 문제","choices":["보기 1","보기 2","보기 3","보기 4"],"correctAnswer":1,"explanation":"수정 해설","contentJson":{}}]}'
```

응답 구조: { setId: UUID, mockTestIds: UUID[], published: false, revisions: {position:number,itemId:UUID,itemVersion:number}[] }

```json
{
  "setId": "11111111-1111-4111-8111-111111111111",
  "mockTestIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "published": false,
  "revisions": [
    {
      "position": 1,
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 2
    }
  ]
}
```

새 문항 버전을 만들고 현재 세트의 포인터를 변경합니다. 연결된 모의고사는 비공개로 바뀝니다. choices가 4개 미만이면 적절한 이미지 선택지 등 실제 문항 유효성 조건을 만족해야 합니다. 동일 위치·문항 중복, 변경 없는 저장은 거부합니다.

주요 오류: 400 QUESTION_REVISION_DUPLICATE / QUESTION_INVALID / QUESTION_UNCHANGED, 409 QUESTION_VERSION_CONFLICT, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="tts"></a>
## TTS 작업·음원

| API | 호출 |
|---|---|
| [TTS 작업 목록](#admin-14) | `GET /v1/admin/tts/jobs` |
| [관리자 음원 재생 URL](#admin-15) | `GET /v1/admin/listening/audio/:audioAssetId/url` |
| [세트 TTS 생성](#admin-16) | `POST /v1/admin/listening/sets/:setId/tts` |
| [세트 TTS 생성 (호환)](#admin-16) | `POST /v1/admin/listening/sets/:setId/versions/:setVersion/tts` |
| [음원 그룹 TTS 생성](#admin-17) | `POST /v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/tts` |
| [음원 그룹 TTS 생성 (호환)](#admin-17) | `POST /v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/tts` |
| [음원 그룹 연결 삭제](#admin-18) | `DELETE /v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/audio/:audioAssetId` |
| [음원 그룹 연결 삭제 (호환)](#admin-18) | `DELETE /v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/audio/:audioAssetId` |

<a id="admin-14"></a>
### 14. TTS 작업 목록

`GET /v1/admin/tts/jobs`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `limit` 정수 1~200, 기본 100.

```bash
curl -X GET "http://localhost:4000/v1/admin/tts/jobs" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { jobs: TtsJob[] }

```json
{
  "jobs": [
    {
      "jobId": "11111111-1111-4111-8111-111111111111",
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "status": "queued",
      "attempts": 0,
      "errorMessage": null,
      "audioAssetId": null,
      "createdAt": "2026-10-07T00:00:00.000Z",
      "completedAt": null
    }
  ]
}
```

최근 생성 순입니다. queued/processing/succeeded/failed를 확인합니다. 이 API는 이미지 작업 목록을 포함하지 않습니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-15"></a>
### 15. 관리자 음원 재생 URL

`GET /v1/admin/listening/audio/:audioAssetId/url`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/listening/audio/11111111-1111-4111-8111-111111111111/url" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { audioUrl: string }

```json
{
  "audioUrl": "https://example.com/signed-audio.wav"
}
```

URL 유효 기간은 600초입니다.

주요 오류: 404 NOT_FOUND, 503 STORAGE_NOT_CONFIGURED, 502 STORAGE_SIGN_FAILED; [공통 오류](#errors) 적용.

<a id="admin-16"></a>
### 16. 세트 TTS 생성

`POST /v1/admin/listening/sets/:setId/tts`

호환 경로: `POST /v1/admin/listening/sets/:setId/versions/:setVersion/tts`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 전체 생략 가능. `forceRegenerate` boolean 기본 false. `ttsStyle` 객체 기본 {speakingRate:1,stylePrompt:""}; `speakingRate` 유한한 숫자 0.8~1.2(기본 1), `stylePrompt` 앞뒤 공백 제거 문자열 최대 300자(기본 빈 문자열).

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/sets/11111111-1111-4111-8111-111111111111/tts" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false,"ttsStyle":{"speakingRate":1,"stylePrompt":""}}'
```

응답 구조: { queued: number, jobIds: UUID[] }

```json
{
  "queued": 1,
  "jobIds": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

작업 접수 응답이며 완료는 작업 목록 및 듣기 문항 목록에서 확인합니다. 진행 중 작업이나 이미 준비된 음원은 새로 큐에 넣지 않을 수 있습니다. 그룹은 queued:false와 기존 jobId 또는 null, 세트는 새로 접수한 jobIds만 반환합니다.

주요 오류: 503 TTS_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-17"></a>
### 17. 음원 그룹 TTS 생성

`POST /v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/tts`

호환 경로: `POST /v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/tts`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 전체 생략 가능. `forceRegenerate` boolean 기본 false. `ttsStyle` 객체 기본 {speakingRate:1,stylePrompt:""}; `speakingRate` 유한한 숫자 0.8~1.2(기본 1), `stylePrompt` 앞뒤 공백 제거 문자열 최대 300자(기본 빈 문자열).

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/sets/11111111-1111-4111-8111-111111111111/audio-groups/11111111-1111-4111-8111-111111111111/tts" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false,"ttsStyle":{"speakingRate":1,"stylePrompt":""}}'
```

응답 구조: { jobId: UUID | null, queued: boolean, targetCount: number }

```json
{
  "jobId": "11111111-1111-4111-8111-111111111111",
  "queued": true,
  "targetCount": 1
}
```

작업 접수 응답이며 완료는 작업 목록 및 듣기 문항 목록에서 확인합니다. 진행 중 작업이나 이미 준비된 음원은 새로 큐에 넣지 않을 수 있습니다. 그룹은 queued:false와 기존 jobId 또는 null, 세트는 새로 접수한 jobIds만 반환합니다.

주요 오류: 503 TTS_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-18"></a>
### 18. 음원 그룹 연결 삭제

`DELETE /v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/audio/:audioAssetId`

호환 경로: `DELETE /v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/audio/:audioAssetId`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X DELETE "http://localhost:4000/v1/admin/listening/sets/11111111-1111-4111-8111-111111111111/audio-groups/11111111-1111-4111-8111-111111111111/audio/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { deleted: true, deletedBindings: number, storageDeleted: boolean, sharedAssetRetained: boolean }

```json
{
  "deleted": true,
  "deletedBindings": 1,
  "storageDeleted": true,
  "sharedAssetRetained": false
}
```

다른 참조가 있으면 파일을 유지하고 storageDeleted:false일 수 있습니다.

주요 오류: 404 NOT_FOUND, 502 STORAGE_DELETE_FAILED; [공통 오류](#errors) 적용.

<a id="visual"></a>
## 이미지 업로드·생성·삭제

| API | 호출 |
|---|---|
| [듣기 선택지 이미지 업로드](#admin-19) | `POST /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber` |
| [듣기 선택지 이미지 생성](#admin-20) | `POST /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/generate` |
| [듣기 선택지 세트 이미지 일괄 생성](#admin-21) | `POST /v1/admin/listening/sets/:setId/visuals/generate` |
| [듣기 선택지 세트 이미지 일괄 생성 (호환)](#admin-21) | `POST /v1/admin/listening/sets/:setId/versions/:setVersion/visuals/generate` |
| [듣기 선택지 이미지 삭제](#admin-22) | `DELETE /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/assets/:visualAssetId` |
| [읽기 자료 이미지 업로드](#admin-23) | `POST /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material` |
| [읽기 자료 이미지 생성](#admin-24) | `POST /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/generate` |
| [읽기 자료 세트 이미지 일괄 생성](#admin-25) | `POST /v1/admin/reading/sets/:setId/visuals/generate` |
| [읽기 자료 세트 이미지 일괄 생성 (호환)](#admin-25) | `POST /v1/admin/reading/sets/:setId/versions/:setVersion/visuals/generate` |
| [읽기 자료 이미지 삭제](#admin-26) | `DELETE /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/assets/:visualAssetId` |

<a id="admin-19"></a>
### 19. 듣기 선택지 이미지 업로드

`POST /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber`

- 인증: 관리자 액세스 토큰
- 성공: `201`

본문: multipart/form-data 파일 1개. 예시 필드명은 `file`이며 구현은 첫 파일을 사용합니다. PNG/JPEG/WebP MIME만 허용, 최대 5 MiB. JSON 본문이 아닙니다.

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/items/11111111-1111-4111-8111-111111111111/versions/1/visual-options/1" -H "Authorization: Bearer ADMIN_TOKEN" -F "file=@example.png;type=image/png"
```

응답 구조: { visualAssetId: UUID, url: string }

```json
{
  "visualAssetId": "11111111-1111-4111-8111-111111111111",
  "url": "https://example.com/image.png"
}
```

현재 세트에서 사용 중인 문항 버전에 연결합니다. 읽기 자료는 내부 optionNumber=1, visualRole=material로 저장합니다.

주요 오류: 400 IMAGE_REQUIRED, 404 NOT_FOUND, 413 파일 크기 초과, 502 STORAGE_UPLOAD_FAILED; [공통 오류](#errors) 적용.

<a id="admin-20"></a>
### 20. 듣기 선택지 이미지 생성

`POST /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/generate`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 생략 가능. `forceRegenerate` boolean, 기본 false.

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/items/11111111-1111-4111-8111-111111111111/versions/1/visual-options/1/generate" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false}'
```

응답 구조: { queued:boolean, jobId:UUID|null, alreadyReady:boolean }

```json
{
  "queued": true,
  "jobId": "11111111-1111-4111-8111-111111111111",
  "alreadyReady": false
}
```

queued:false이면 기존 작업(jobId 존재) 또는 이미 준비된 이미지(alreadyReady:true, jobId:null)를 의미합니다. 이미지 생성 상태는 읽기·듣기 문항 조회에서 확인합니다. 읽기 자료 생성은 현재 세트의 10번 그래프 자료를 대상으로 합니다.

주요 오류: 503 VISUAL_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-21"></a>
### 21. 듣기 선택지 세트 이미지 일괄 생성

`POST /v1/admin/listening/sets/:setId/visuals/generate`

호환 경로: `POST /v1/admin/listening/sets/:setId/versions/:setVersion/visuals/generate`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 생략 가능. `forceRegenerate` boolean, 기본 false.

```bash
curl -X POST "http://localhost:4000/v1/admin/listening/sets/11111111-1111-4111-8111-111111111111/visuals/generate" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false}'
```

응답 구조: { queued:number, jobIds:UUID[] }

```json
{
  "queued": 1,
  "jobIds": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

새로 접수한 작업의 수와 ID를 반환합니다. 필요 작업이 없으면 queued:0과 빈 jobIds 배열입니다.

주요 오류: 503 VISUAL_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-22"></a>
### 22. 듣기 선택지 이미지 삭제

`DELETE /v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/assets/:visualAssetId`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X DELETE "http://localhost:4000/v1/admin/listening/items/11111111-1111-4111-8111-111111111111/versions/1/visual-options/1/assets/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { deleted:true, storageDeleted:boolean, sharedAssetRetained?:true }

```json
{
  "deleted": true,
  "storageDeleted": false,
  "sharedAssetRetained": true
}
```

현재 자산만 삭제합니다. 파일이 공유되거나 진행 중 마라톤에서 참조하면 보존할 수 있습니다. storageDeleted:true일 때 sharedAssetRetained는 생략됩니다.

주요 오류: 404 NOT_FOUND, 502 STORAGE_DELETE_FAILED; [공통 오류](#errors) 적용.

<a id="admin-23"></a>
### 23. 읽기 자료 이미지 업로드

`POST /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material`

- 인증: 관리자 액세스 토큰
- 성공: `201`

본문: multipart/form-data 파일 1개. 예시 필드명은 `file`이며 구현은 첫 파일을 사용합니다. PNG/JPEG/WebP MIME만 허용, 최대 5 MiB. JSON 본문이 아닙니다.

```bash
curl -X POST "http://localhost:4000/v1/admin/reading/items/11111111-1111-4111-8111-111111111111/versions/1/visual-material" -H "Authorization: Bearer ADMIN_TOKEN" -F "file=@example.png;type=image/png"
```

응답 구조: { visualAssetId: UUID, url: string }

```json
{
  "visualAssetId": "11111111-1111-4111-8111-111111111111",
  "url": "https://example.com/image.png"
}
```

현재 세트에서 사용 중인 문항 버전에 연결합니다. 읽기 자료는 내부 optionNumber=1, visualRole=material로 저장합니다.

주요 오류: 400 IMAGE_REQUIRED, 404 NOT_FOUND, 413 파일 크기 초과, 502 STORAGE_UPLOAD_FAILED; [공통 오류](#errors) 적용.

<a id="admin-24"></a>
### 24. 읽기 자료 이미지 생성

`POST /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/generate`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 생략 가능. `forceRegenerate` boolean, 기본 false.

```bash
curl -X POST "http://localhost:4000/v1/admin/reading/items/11111111-1111-4111-8111-111111111111/versions/1/visual-material/generate" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false}'
```

응답 구조: { queued:boolean, jobId:UUID|null, alreadyReady:boolean }

```json
{
  "queued": true,
  "jobId": "11111111-1111-4111-8111-111111111111",
  "alreadyReady": false
}
```

queued:false이면 기존 작업(jobId 존재) 또는 이미 준비된 이미지(alreadyReady:true, jobId:null)를 의미합니다. 이미지 생성 상태는 읽기·듣기 문항 조회에서 확인합니다. 읽기 자료 생성은 현재 세트의 10번 그래프 자료를 대상으로 합니다.

주요 오류: 503 VISUAL_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-25"></a>
### 25. 읽기 자료 세트 이미지 일괄 생성

`POST /v1/admin/reading/sets/:setId/visuals/generate`

호환 경로: `POST /v1/admin/reading/sets/:setId/versions/:setVersion/visuals/generate`

- 인증: 관리자 액세스 토큰
- 성공: `202`

본문 생략 가능. `forceRegenerate` boolean, 기본 false.

```bash
curl -X POST "http://localhost:4000/v1/admin/reading/sets/11111111-1111-4111-8111-111111111111/visuals/generate" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"forceRegenerate":false}'
```

응답 구조: { queued:number, jobIds:UUID[] }

```json
{
  "queued": 1,
  "jobIds": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

새로 접수한 작업의 수와 ID를 반환합니다. 필요 작업이 없으면 queued:0과 빈 jobIds 배열입니다.

주요 오류: 503 VISUAL_WORKER_DISABLED, 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-26"></a>
### 26. 읽기 자료 이미지 삭제

`DELETE /v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/assets/:visualAssetId`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X DELETE "http://localhost:4000/v1/admin/reading/items/11111111-1111-4111-8111-111111111111/versions/1/visual-material/assets/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { deleted:true, storageDeleted:boolean, sharedAssetRetained?:true }

```json
{
  "deleted": true,
  "storageDeleted": false,
  "sharedAssetRetained": true
}
```

현재 자산만 삭제합니다. 파일이 공유되거나 진행 중 마라톤에서 참조하면 보존할 수 있습니다. storageDeleted:true일 때 sharedAssetRetained는 생략됩니다.

주요 오류: 404 NOT_FOUND, 502 STORAGE_DELETE_FAILED; [공통 오류](#errors) 적용.

<a id="responses"></a>
## 시험 응답 조회·삭제

| API | 호출 |
|---|---|
| [응시 세션 목록](#admin-27) | `GET /v1/admin/responses/sessions` |
| [세션의 문항별 응답](#admin-28) | `GET /v1/admin/responses/sessions/:sessionId` |
| [선택한 응시 세션 삭제](#admin-29) | `DELETE /v1/admin/responses/sessions` |
| [제출 완료 응답 세션 전체 삭제](#admin-30) | `DELETE /v1/admin/responses/sessions/all` |
| [중단 세션 전체 삭제](#admin-31) | `DELETE /v1/admin/responses/sessions/abandoned/all` |

<a id="admin-27"></a>
### 27. 응시 세션 목록

`GET /v1/admin/responses/sessions`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `section` reading/listening, `correctness` correct/incorrect/unanswered, `status` submitted/abandoned, `page` 양의 정수(기본 1), `pageSize` 정수 10~100(기본 50).

```bash
curl -X GET "http://localhost:4000/v1/admin/responses/sessions" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { sessions: (AdminResponseSession & {totalCount:number})[], total:number }

```json
{
  "sessions": [
    {
      "totalCount": 1,
      "sessionId": "11111111-1111-4111-8111-111111111111",
      "userId": "22222222-2222-4222-8222-222222222222",
      "mockTestTitle": "읽기 1회",
      "mode": "practice",
      "status": "submitted",
      "startedAt": "2026-10-07T00:00:00.000Z",
      "submittedAt": "2026-10-07T00:00:00.000Z",
      "abandonedAt": null,
      "score": 100,
      "maxScore": 100,
      "rating": 5,
      "section": "reading",
      "responseCount": 50,
      "answeredCount": 50,
      "unansweredCount": 0,
      "correctCount": 50,
      "incorrectCount": 0,
      "resultEmail": null
    }
  ],
  "total": 1
}
```

진행 중 세션은 제외합니다. correctness는 해당 유형의 response_observations가 존재하는 세션을 찾습니다. 현재 구현은 빈 페이지에서 total:0을 반환하며 page/pageSize는 응답에 없습니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-28"></a>
### 28. 세션의 문항별 응답

`GET /v1/admin/responses/sessions/:sessionId`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/responses/sessions/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { responses: AdminResponseObservation[] }

```json
{
  "responses": [
    {
      "observationId": "22222222-2222-4222-8222-222222222222",
      "userId": "22222222-2222-4222-8222-222222222222",
      "sessionId": "11111111-1111-4111-8111-111111111111",
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "itemOrder": 1,
      "section": "reading",
      "testPosition": 1,
      "mockTestTitle": "읽기 1회",
      "itemType": "grammar",
      "selectedOption": 1,
      "correctAnswer": 1,
      "isCorrect": true,
      "responseTimeMs": 1500,
      "skipped": false,
      "timedOut": false,
      "answerChanged": false,
      "policyVersion": "STATIC_MOCK_V1",
      "createdAt": "2026-10-07T00:00:00.000Z",
      "mode": "practice",
      "score": 100,
      "rating": 5,
      "question": {
        "itemOrder": 1,
        "section": "reading",
        "testPosition": 1,
        "itemId": "22222222-2222-4222-8222-222222222222",
        "itemVersion": 1,
        "itemType": "grammar",
        "stem": "문제",
        "passage": "",
        "auxiliaryText": "",
        "questionPrompt": "",
        "highlightText": "",
        "choices": [
          "1",
          "2",
          "3",
          "4"
        ],
        "visualOptions": [],
        "materialVisual": null,
        "audioAssetId": null,
        "repeatCount": 1,
        "selectedOption": 1
      },
      "explanation": "해설"
    }
  ]
}
```

response_observations 기준이며 관측 기록이 없는 중단 세션은 목록에 있어도 상세 조회가 404일 수 있습니다.

주요 오류: 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-29"></a>
### 29. 선택한 응시 세션 삭제

`DELETE /v1/admin/responses/sessions`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `sessionIds` UUID 배열 1~100개.

```bash
curl -X DELETE "http://localhost:4000/v1/admin/responses/sessions" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"sessionIds":["11111111-1111-4111-8111-111111111111"]}'
```

응답 구조: { deletedSessions:number, deletedObservations:number }

```json
{
  "deletedSessions": 1,
  "deletedObservations": 50
}
```

중복 ID는 제거합니다. submitted 또는 abandoned 세션만 허용하며 하나라도 없거나 진행 중이면 전체 요청을 거부합니다. 삭제된 세션·관측 수를 반환하고 감사 이력을 남깁니다.

주요 오류: 409 RESPONSE_SESSION_INVALID(선택 삭제); [공통 오류](#errors) 적용.

<a id="admin-30"></a>
### 30. 제출 완료 응답 세션 전체 삭제

`DELETE /v1/admin/responses/sessions/all`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `confirmation`은 정확히 "전체 응답 삭제".

```bash
curl -X DELETE "http://localhost:4000/v1/admin/responses/sessions/all" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"confirmation":"전체 응답 삭제"}'
```

응답 구조: { deletedSessions:number, deletedObservations:number }

```json
{
  "deletedSessions": 1,
  "deletedObservations": 50
}
```

응답 관측 기록이 있는 submitted 세션만 삭제합니다. abandoned·in_progress는 이 경로의 대상이 아닙니다. 삭제된 세션·관측 수를 반환하고 감사 이력을 남깁니다.

주요 오류: 409 RESPONSE_SESSION_INVALID(선택 삭제); [공통 오류](#errors) 적용.

<a id="admin-31"></a>
### 31. 중단 세션 전체 삭제

`DELETE /v1/admin/responses/sessions/abandoned/all`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `confirmation`은 정확히 "폐기 세션 전체 삭제".

```bash
curl -X DELETE "http://localhost:4000/v1/admin/responses/sessions/abandoned/all" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"confirmation":"폐기 세션 전체 삭제"}'
```

응답 구조: { deletedSessions:number, deletedObservations:number }

```json
{
  "deletedSessions": 1,
  "deletedObservations": 50
}
```

abandoned 세션 전체를 삭제합니다. 삭제된 세션·관측 수를 반환하고 감사 이력을 남깁니다.

주요 오류: 409 RESPONSE_SESSION_INVALID(선택 삭제); [공통 오류](#errors) 적용.

<a id="marathon"></a>
## 마라톤 관리

| API | 호출 |
|---|---|
| [마라톤 문항 목록](#admin-32) | `GET /v1/admin/marathon/questions` |
| [문항 난이도 지정·해제](#admin-33) | `PUT /v1/admin/marathon/sets/:setId/items/:itemId/difficulty` |
| [마라톤 세션 목록](#admin-34) | `GET /v1/admin/marathon/sessions` |
| [마라톤 문항별 응답](#admin-35) | `GET /v1/admin/marathon/sessions/:sessionId/responses` |

<a id="admin-32"></a>
### 32. 마라톤 문항 목록

`GET /v1/admin/marathon/questions`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `section` reading/listening, `setId` UUID, `difficulty` 정수 1~3, `page` 정수 1~1,000,000(기본 1).

```bash
curl -X GET "http://localhost:4000/v1/admin/marathon/questions" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { items: InventoryItem[], total:number, sets:{setId:UUID,titleKo:string,section:string}[], page:number, pageSize:50 }

```json
{
  "items": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "mockTestId": "11111111-1111-4111-8111-111111111111",
      "titleKo": "읽기 1회",
      "titleEn": "Reading 1",
      "section": "reading",
      "position": 1,
      "defaultDifficulty": 1,
      "overrideDifficulty": null,
      "difficulty": 1,
      "updatedBy": null,
      "updatedAt": null,
      "answeredCount": 0,
      "correctCount": 0,
      "personalCount": 0,
      "ready": true,
      "question": {
        "itemOrder": 1,
        "section": "reading",
        "testPosition": 1,
        "itemId": "22222222-2222-4222-8222-222222222222",
        "itemVersion": 1,
        "itemType": "grammar",
        "stem": "문제",
        "passage": "",
        "auxiliaryText": "",
        "questionPrompt": "",
        "highlightText": "",
        "choices": [
          "1",
          "2",
          "3",
          "4"
        ],
        "visualOptions": [],
        "materialVisual": null,
        "audioAssetId": null,
        "repeatCount": 1,
        "selectedOption": null
      },
      "correctAnswer": 1,
      "explanation": "해설",
      "audioAssetId": null,
      "visualAssetIds": []
    }
  ],
  "total": 1,
  "sets": [
    {
      "setId": "11111111-1111-4111-8111-111111111111",
      "titleKo": "읽기 1회",
      "section": "reading"
    }
  ],
  "page": 1,
  "pageSize": 50
}
```

공개 모의고사에서 문항을 모으며 ready:false인 항목도 반환할 수 있습니다. sets는 필터 적용 전 전체 후보 세트입니다. 개인 브라우저 필터가 없어 personalCount는 0입니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-33"></a>
### 33. 문항 난이도 지정·해제

`PUT /v1/admin/marathon/sets/:setId/items/:itemId/difficulty`

- 인증: 관리자 액세스 토큰
- 성공: `200`

본문 필수: `difficulty` 숫자 1/2/3 또는 null.

```bash
curl -X PUT "http://localhost:4000/v1/admin/marathon/sets/11111111-1111-4111-8111-111111111111/items/11111111-1111-4111-8111-111111111111/difficulty" -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"difficulty":2}'
```

응답

```json
{
  "updated": true
}
```

null이면 기본 난이도를 사용합니다. 지정은 문항 ID 단위로 버전 변경 후에도 유지됩니다.

주요 오류: 404 NOT_FOUND; [공통 오류](#errors) 적용.

<a id="admin-34"></a>
### 34. 마라톤 세션 목록

`GET /v1/admin/marathon/sessions`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `section` reading/listening, `page` 정수 1~1,000,000(기본 1).

```bash
curl -X GET "http://localhost:4000/v1/admin/marathon/sessions" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { sessions: MarathonAdminSession[], total:number, page:number, pageSize:50 }

```json
{
  "sessions": [
    {
      "sessionId": "11111111-1111-4111-8111-111111111111",
      "browserId": "22222222-2222-4222-8222-222222222222",
      "section": "reading",
      "status": "in_progress",
      "startedAt": "2026-10-07T00:00:00.000Z",
      "lastSeenAt": "2026-10-07T00:00:00.000Z",
      "registered": false,
      "answeredCount": 1,
      "correctCount": 1,
      "assignedCount": 1
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

in_progress와 abandoned를 포함하고 lastSeenAt 내림차순입니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-35"></a>
### 35. 마라톤 문항별 응답

`GET /v1/admin/marathon/sessions/:sessionId/responses`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `page` 정수 1~1,000,000(기본 1). `section`도 검증은 되지만 조회에는 사용하지 않습니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/marathon/sessions/11111111-1111-4111-8111-111111111111/responses" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: { items: MarathonAdminResponse[], total:number, page:number, pageSize:50 }

```json
{
  "items": [
    {
      "itemOrder": 1,
      "setId": "11111111-1111-4111-8111-111111111111",
      "testPosition": 1,
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "difficulty": 1,
      "requestedDifficulty": 1,
      "recentAccuracy": null,
      "policyVersion": "MARATHON_V1",
      "question": {
        "itemOrder": 1,
        "section": "reading",
        "testPosition": 1,
        "itemId": "22222222-2222-4222-8222-222222222222",
        "itemVersion": 1,
        "itemType": "grammar",
        "stem": "문제",
        "passage": "",
        "auxiliaryText": "",
        "questionPrompt": "",
        "highlightText": "",
        "choices": [
          "1",
          "2",
          "3",
          "4"
        ],
        "visualOptions": [],
        "materialVisual": null,
        "audioAssetId": null,
        "repeatCount": 1,
        "selectedOption": null
      },
      "selectedOption": 1,
      "correctAnswer": 1,
      "explanation": "해설",
      "isCorrect": true,
      "responseTimeMs": 1500,
      "selectionCount": 1,
      "submittedAt": "2026-10-07T00:00:00.000Z",
      "titleKo": "읽기 1회"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

문항 순서 내림차순. 미제출 문항도 포함하며 selectedOption/isCorrect/submittedAt은 null일 수 있습니다. 없는 세션은 빈 목록입니다. question은 발급 시 저장한 스냅샷이므로 선택 답안은 바깥 selectedOption을 사용합니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="preregistration"></a>
## 사전등록 관리

| API | 호출 |
|---|---|
| [사전등록 목록](#admin-36) | `GET /v1/admin/preregistrations` |
| [사전등록 CSV 다운로드](#admin-37) | `GET /v1/admin/preregistrations.csv` |
| [사전등록 삭제](#admin-38) | `DELETE /v1/admin/preregistrations/:registrationId` |

<a id="admin-36"></a>
### 36. 사전등록 목록

`GET /v1/admin/preregistrations`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `source` landing/topik_result/marathon, `deduplicate` 문자열 true/false(기본 false), `from`·`to` 실제 날짜 YYYY-MM-DD(from≤to), `search` 앞뒤 공백 제거 이메일 검색 문자열 최대 320자(기본 빈 문자열). `page` 정수 1~1,000,000(기본 1), `pageSize` 정수 1~100(기본 50).

```bash
curl -X GET "http://localhost:4000/v1/admin/preregistrations" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: AdminPreregistrationList

```json
{
  "registrations": [
    {
      "registrationId": "001-00000001",
      "email": "learner@example.com",
      "source": "landing",
      "sourceCode": "001",
      "consentedAt": "2026-10-07T00:00:00.000Z",
      "locale": "ko",
      "privacyConsent": true,
      "marketingConsent": true,
      "consentVersion": "preregistration_v1"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

날짜는 Asia/Seoul 기준 시작일 00:00 포함, 종료 다음 날 00:00 미포함. deduplicate:true이면 필터링 후 정규화 이메일별 최신 1건을 반환합니다. 검색은 이메일에 대한 대소문자 구분 없는 리터럴 부분 검색입니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-37"></a>
### 37. 사전등록 CSV 다운로드

`GET /v1/admin/preregistrations.csv`

- 인증: 관리자 액세스 토큰
- 성공: `200`

쿼리 선택: `source` landing/topik_result/marathon, `deduplicate` 문자열 true/false(기본 false), `from`·`to` 실제 날짜 YYYY-MM-DD(from≤to), `search` 앞뒤 공백 제거 이메일 검색 문자열 최대 320자(기본 빈 문자열).

```bash
curl -X GET "http://localhost:4000/v1/admin/preregistrations.csv" -H "Authorization: Bearer ADMIN_TOKEN" -o export.csv
```

응답은 CSV 파일입니다. [CSV 형식과 컬럼](#csv-format)을 참조합니다.

페이지 제한 없이 필터에 해당하는 전체 행을 다운로드합니다. Cache-Control:no-store, Content-Disposition:attachment; filename="unigate_preregistrations_<Unix밀리초>.csv". 이 경로에는 X-Export-Row-Count가 없습니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-38"></a>
### 38. 사전등록 삭제

`DELETE /v1/admin/preregistrations/:registrationId`

- 인증: 관리자 액세스 토큰
- 성공: `204`

경로 `registrationId`: 문자열, 정규식 `^00[123]-\d{8,19}$`. UUID가 아닙니다.

```bash
curl -X DELETE "http://localhost:4000/v1/admin/preregistrations/001-00000001" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 본문 없음.

존재하지 않는 번호도 204입니다. 실제 삭제 시 감사 이력을 남깁니다. 마라톤 브라우저에 저장된 등록 상태를 취소하는 동작은 없습니다.

주요 오류: [공통 오류](#errors) 적용.

<a id="exports"></a>
## 데이터 내보내기

| API | 호출 |
|---|---|
| [내보내기 필터 선택지](#admin-39) | `GET /v1/admin/exports/options` |
| [내보내기 미리보기](#admin-40) | `GET /v1/admin/exports/:dataset/preview` |
| [데이터셋 CSV 다운로드](#admin-41) | `GET /v1/admin/exports/:dataset.csv` |

<a id="admin-39"></a>
### 39. 내보내기 필터 선택지

`GET /v1/admin/exports/options`

- 인증: 관리자 액세스 토큰
- 성공: `200`

추가 쿼리·본문 필드 없음. 경로 매개변수는 공통 규칙을 따릅니다.

```bash
curl -X GET "http://localhost:4000/v1/admin/exports/options" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: AdminExportOptions

```json
{
  "mockTests": [
    {
      "mockTestId": "11111111-1111-4111-8111-111111111111",
      "slug": "reading-1",
      "titleKo": "읽기 1회",
      "titleEn": "Reading 1",
      "isPublished": true
    }
  ],
  "itemTypes": [
    "grammar"
  ]
}
```

주요 오류: [공통 오류](#errors) 적용.

<a id="admin-40"></a>
### 40. 내보내기 미리보기

`GET /v1/admin/exports/:dataset/preview`

- 인증: 관리자 액세스 토큰
- 성공: `200`

경로 `dataset`: questions/responses/sessions. 쿼리는 [내보내기 필터](#export-filters) 참조.

```bash
curl -X GET "http://localhost:4000/v1/admin/exports/responses/preview" -H "Authorization: Bearer ADMIN_TOKEN"
```

응답 구조: AdminExportPreview

```json
{
  "rowCount": 50,
  "sessionCount": 1,
  "filters": {
    "source": "set",
    "status": "submitted",
    "minAssignedCount": 0,
    "outcome": "all",
    "rating": "all",
    "resultEmail": "all"
  },
  "generatedAt": "2026-10-07T00:00:00.000Z"
}
```

filters는 데이터셋에 맞게 정규화된 실제 적용 필터입니다. 데이터 행 대신 건수만 반환합니다. 선택적 필드가 없으면 응답에서 생략됩니다.

주요 오류: 400 INVALID_EXPORT_FILTER; [공통 오류](#errors) 적용.

<a id="admin-41"></a>
### 41. 데이터셋 CSV 다운로드

`GET /v1/admin/exports/:dataset.csv`

- 인증: 관리자 액세스 토큰
- 성공: `200`

경로 `dataset`: questions/responses/sessions. 쿼리는 [내보내기 필터](#export-filters) 참조.

```bash
curl -X GET "http://localhost:4000/v1/admin/exports/responses.csv" -H "Authorization: Bearer ADMIN_TOKEN" -o export.csv
```

응답은 CSV 파일입니다. [CSV 형식과 컬럼](#csv-format)을 참조합니다.

Cache-Control:no-store, Content-Type:text/csv; charset=utf-8, Content-Disposition:attachment; filename="unigate_<dataset>_YYYYMMDD_HHmmss_KST.csv", X-Export-Row-Count:행 수. 다운로드 직전 미리보기의 건수이므로 동시 변경이 있으면 파일과 달라질 수 있습니다.

주요 오류: 400 INVALID_EXPORT_FILTER; [공통 오류](#errors) 적용.

<a id="export-filters"></a>
## 내보내기 필터

모두 쿼리 매개변수이며 선택입니다. 문자열을 URL 인코딩합니다.

| 필드 | 형식·허용값 | 기본값 |
|---|---|---|
| source | set / marathon / all | set |
| mockTestId | UUID | 제한 없음 |
| section | reading / listening | 제한 없음 |
| mode | timed / practice | 제한 없음 |
| status | submitted / abandoned / in_progress / all | submitted |
| from, to | YYYY-MM-DD 실제 날짜, from≤to, KST 날짜 경계 | 제한 없음 |
| itemType | 앞뒤 공백 제거 문자열 1~100자 | 제한 없음 |
| minAssignedCount | 정수 0~1,000,000 | 0 |
| outcome | all / answered / correct / incorrect / unanswered | all |
| rating | all / none / 1 / 2 / 3 / 4 / 5 | all |
| resultEmail | all / accepted / not_accepted | all |

- questions는 outcome/rating/resultEmail을 all로 정규화합니다.
- responses는 itemType을 제거하고 minAssignedCount=0, rating/resultEmail=all로 정규화합니다.
- sessions는 itemType을 제거하고 minAssignedCount=0, outcome=all로 정규화합니다.
- 날짜는 from 자정 포함, to 다음 날 자정 제외입니다. 일반 시험은 status=in_progress일 때 started_at, 나머지는 submitted_at 또는 abandoned_at을 사용합니다.
- 일반 시험의 status=all은 submitted·abandoned만 포함합니다. 진행 중 세션도 모두 포함한다는 뜻은 아닙니다.
- 마라톤의 status=submitted는 세션 종료가 아니라 개별 답안 제출을 뜻합니다. sessions에서는 제출 문항이 있는 세션, questions/responses에서는 제출된 문항으로 제한합니다. status=all은 진행 중·중단 마라톤을 모두 포함합니다.
- 마라톤 날짜는 sessions에서 started_at, questions/responses에서 submitted_at 또는 presented_at입니다.
- 마라톤에는 timed/practice·별점·결과 이메일이 없습니다. mode를 지정하면 마라톤 행이 제외되고, 적용 후 rating이 1~5이거나 resultEmail=accepted여도 제외됩니다. rating=none, resultEmail=not_accepted는 허용됩니다.
- source=all은 일반 시험과 마라톤 결과를 합치며 source 컬럼으로 구별합니다. 마라톤 user_id는 browser_id입니다. 마라톤에 없는 mode·일반 시험 점수·메일 등 컬럼은 빈 셀이며 questions의 marathon_difficulty는 집계된 난이도 문자열일 수 있습니다.

<a id="csv-format"></a>
## CSV 형식과 컬럼

UTF-8 BOM과 CRLF 줄바꿈, 첫 행 헤더를 사용합니다. null은 빈 셀, 객체·배열은 JSON 문자열, 날짜는 ISO 문자열입니다. 값은 큰따옴표로 감싸며 내부 큰따옴표는 두 번 기록합니다. 수식으로 해석될 수 있는 값은 작은따옴표 접두사로 보호합니다.

사전등록 CSV 컬럼 순서:

`registration_id`, `email_original`, `source`, `source_code`, `consented_at`, `locale`, `privacy_consent`, `marketing_consent`, `consent_version`.

### questions

`source`, `mock_test_id`, `mock_test_slug`, `mock_test_title_ko`, `mock_test_title_en`, `section`, `set_id`, `test_position`, `item_id`, `item_version`, `item_type`, `primary_skill`, `target_level`, `predicted_difficulty`, `irt_difficulty`, `irt_discrimination`, `question_prompt`, `stem`, `passage`, `auxiliary_text`, `highlight_text`, `choice_1`, `choice_2`, `choice_3`, `choice_4`, `correct_answer`, `explanation`, `transcript_json`, `visual_options_json`, `content_json`, `assigned_count`, `answered_count`, `unanswered_count`, `correct_count`, `incorrect_count`, `answered_accuracy_pct`, `overall_accuracy_pct`, `option_1_count`, `option_2_count`, `option_3_count`, `option_4_count`, `option_1_pct`, `option_2_pct`, `option_3_pct`, `option_4_pct`, `avg_answered_response_time_ms`, `median_answered_response_time_ms`, `answer_changed_count`, `answer_changed_rate_pct`, `marathon_difficulty`, `requested_difficulty`, `recent_accuracy`, `policy_version`

### responses

`source`, `session_id`, `user_id`, `mock_test_id`, `mock_test_slug`, `mock_test_title_ko`, `mock_test_title_en`, `mode`, `status`, `started_at`, `completed_at`, `timed_out_submission`, `session_score`, `max_score`, `score_pct`, `rating`, `feedback_locale`, `section`, `set_id`, `item_order`, `test_position`, `item_id`, `item_version`, `item_type`, `selected_option`, `correct_answer`, `response_outcome`, `is_correct`, `response_time_ms`, `skipped`, `timed_out`, `answer_changed`, `selection_count`, `first_selected_at`, `final_selected_at`, `policy_version`, `marathon_difficulty`, `requested_difficulty`, `recent_accuracy`

### sessions

`source`, `session_id`, `user_id`, `mock_test_id`, `mock_test_slug`, `mock_test_title_ko`, `mock_test_title_en`, `mode`, `status`, `started_at`, `submitted_at`, `abandoned_at`, `completed_at`, `duration_seconds`, `timed_out_submission`, `score`, `max_score`, `score_pct`, `total_items`, `answered_count`, `unanswered_count`, `correct_count`, `incorrect_count`, `rating`, `feedback_locale`, `result_email`, `result_email_accepted`, `marathon_difficulty`, `requested_difficulty`, `recent_accuracy`, `policy_version`

questions는 문항별 배정·응답·정답 통계를, responses는 문항별 응답을, sessions는 세션별 요약을 반환합니다. `_pct`는 백분율, `_ms`는 밀리초입니다. questions의 unanswered_count는 배정 수에서 답변 수를 뺀 값이고 incorrect_count는 답변한 오답 수입니다. null이 CSV에서 빈 셀이므로 0과 구분해야 합니다.

<a id="models"></a>
## 응답 데이터 구조

`?`는 생략 가능, `| null`은 null 가능. `Question`, `TranscriptTurn`, `ExamMode`는 [일반 API 응답 정의](api.md#models)를 참조합니다. 아래는 반환 필드 설명용 TypeScript 표기입니다. `contentJson`, `chartSpec`은 문항 종류별 JSON이며 고정 필드로 제한하지 않습니다.

```typescript
export interface AdminPreregistration {
  registrationId: string;
  email: string;
  source: "landing" | "topik_result" | "marathon";
  sourceCode: "001" | "002" | "003";
  consentedAt: string;
  locale: "ko" | "en";
  privacyConsent: boolean;
  marketingConsent: boolean;
  consentVersion: string;
}

export interface AdminPreregistrationFilters {
  source?: "landing" | "topik_result" | "marathon";
  deduplicate: boolean;
  from?: string;
  to?: string;
  search: string;
}

export interface AdminPreregistrationList {
  registrations: AdminPreregistration[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSummary {
  totalItems: number; totalVersions: number; readingVersions: number; listeningVersions: number;
  setCount: number; mockTestCount: number; publishedMockTests: number; audioReady: number;
  audioMissing: number; visualReady: number; jobsQueued: number; jobsProcessing: number;
  jobsFailed: number; sessionsToday: number;
  responseCount: number; answeredResponseCount: number; unansweredResponseCount: number;
  emailUsage: {
    enabled: boolean; configured: boolean; cycleStart: string; cycleEnd: string;
    acceptedCount: number; pendingCount: number; limit: number; remaining: number;
    warningThreshold: number; warningStatus: "not_sent" | "pending" | "accepted" | "failed";
  };
}

export interface AdminListeningTarget {
  itemId: string; itemVersion: number; position: number; itemType: string; questionPrompt: string;
  stem: string; choices: string[]; correctAnswer: number | null; explanation: string;
  contentJson: Record<string, unknown>;
  visualOptionCount: number; visualReadyCount: number; visualOptions: AdminVisualOption[];
}

export interface AdminVisualPromptOption {
  optionNumber: number; description: string; imagePrompt: string; chartSpec: Record<string, unknown> | null;
}

export interface AdminVisualOption extends AdminVisualPromptOption {
  visualAssetId: string | null; imageUrl: string | null;
  generationStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  generationError: string | null;
}

export interface AdminListeningGroup {
  setId: string; positions: number[]; leaderItemId: string; leaderItemVersion: number;
  itemType: string; dialogueTurns: TranscriptTurn[] | null; questionPrompts: string[]; repeatCount: number;
  audioAssetId: string | null; audioStorageUrl: string | null;
  audioStatus: "ready" | "legacy" | "missing" | "partial"; targets: AdminListeningTarget[];
  narrationVersion: "dialogue_v1" | "exam_track_v2" | "exam_track_v3" | "exam_track_v4" | null;
  appliedScript: AdminNarrationScript | null; generationScript: AdminNarrationScript | null;
  generationJobId: string | null; generationStatus: TtsGenerationStatus | null;
  generationTtsStyle: TtsStyle | null; lastError: string | null; ttsStyle: TtsStyle | null;
}

export type AdminNarrationSegment =
  | { kind: "bell" }
  | { kind: "speech"; role: "instruction" | "reread" | "question_number"; speaker: "여자"; text: string }
  | { kind: "dialogue"; repeatIndex: 1 | 2; turns: TranscriptTurn[] }
  | { kind: "silence"; durationMs: number };

export interface AdminNarrationScript {
  version: "exam_track_v2" | "exam_track_v3" | "exam_track_v4"; kind: "single" | "common"; positions: number[];
  segments: AdminNarrationSegment[];
}

export type TtsGenerationStatus = "queued" | "processing" | "succeeded" | "failed";

export interface TtsJob {
  jobId: string; itemId: string; itemVersion: number; status: TtsGenerationStatus;
  attempts: number; errorMessage: string | null; audioAssetId: string | null; createdAt: string; completedAt: string | null;
}

export type AdminListeningSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID";

export interface AdminListeningSet {
  setId: string; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  audioReady: number; visualRequired: number; visualReady: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null;
  readyToRegister: boolean; readyToPublish: boolean; blockingReasons: AdminListeningSetBlockReason[];
}

export interface TtsStyle { speakingRate: number; stylePrompt: string }

export interface AdminReadingItem {
  setId: string; position: number; mockTestTitle: string | null;
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
  visualOptions: AdminVisualPromptOption[];
  materialVisual: AdminReadingMaterialVisual | null;
}

export interface AdminReadingMaterialVisual {
  description: string;
  imagePrompt: string;
  sourceText: string;
  visualAssetId: string | null;
  imageUrl: string | null;
  generationStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  generationError: string | null;
}

export type AdminReadingSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID" | "VISUALS_INCOMPLETE";

export interface AdminReadingSet {
  setId: string; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  visualRequired: number; visualReady: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null; readyToPublish: boolean;
  blockingReasons: AdminReadingSetBlockReason[];
}

export interface AdminResponseSession {
  sessionId: string; userId: string; mockTestTitle: string; mode: ExamMode; status: "submitted" | "abandoned";
  startedAt: string; submittedAt: string | null; abandonedAt: string | null; score: number | null; maxScore: number; rating: number | null;
  resultEmail: string | null;
  section: "reading" | "listening"; responseCount: number; answeredCount: number;
  unansweredCount: number; correctCount: number; incorrectCount: number;
}

export interface AdminQuestionRevision {
  position: number; itemId: string; itemVersion: number; stem: string; choices: string[];
  correctAnswer: number; explanation: string; contentJson: Record<string, unknown>;
}

export interface AdminQuestionVersion {
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
  createdAt: string; isCurrent: boolean;
}

export interface AdminResponseObservation {
  observationId: string; userId: string; sessionId: string; itemId: string; itemVersion: number;
  itemOrder: number; section: "reading" | "listening"; testPosition: number; mockTestTitle: string; itemType: string;
  selectedOption: number | null; correctAnswer: number; isCorrect: boolean; responseTimeMs: number; skipped: boolean;
  timedOut: boolean; answerChanged: boolean; policyVersion: string; createdAt: string;
  mode: ExamMode; score: number | null; rating: number | null;
  question: Question; explanation: string;
}

export type AdminExportDataset = "questions" | "responses" | "sessions";
export type AdminExportStatus = "submitted" | "abandoned" | "in_progress" | "all";
export type AdminExportOutcome = "all" | "answered" | "correct" | "incorrect" | "unanswered";

export interface AdminExportFilters {
  source?: "set" | "marathon" | "all";
  mockTestId?: string;
  section?: "reading" | "listening";
  mode?: ExamMode;
  status: AdminExportStatus;
  from?: string;
  to?: string;
  itemType?: string;
  minAssignedCount: number;
  outcome: AdminExportOutcome;
  rating: "all" | "none" | "1" | "2" | "3" | "4" | "5";
  resultEmail: "all" | "accepted" | "not_accepted";
}

export interface AdminExportOptions {
  mockTests: Array<{
    mockTestId: string;
    slug: string;
    titleKo: string;
    titleEn: string;
    isPublished: boolean;
  }>;
  itemTypes: string[];
}

export interface AdminExportPreview {
  rowCount: number;
  sessionCount: number;
  filters: AdminExportFilters;
  generatedAt: string;
}
```

```typescript
type InventoryItem = {
  setId:string; itemId:string; itemVersion:number; mockTestId:string;
  titleKo:string; titleEn:string; section:string; position:number;
  defaultDifficulty:1|2|3; overrideDifficulty:1|2|3|null; difficulty:1|2|3;
  updatedBy:string|null; updatedAt:string|null;
  answeredCount:number; correctCount:number; personalCount:number; ready:boolean;
  question:Question; correctAnswer:number; explanation:string;
  audioAssetId:string|null; visualAssetIds:string[];
};
type MarathonAdminSession = {
  sessionId:string; browserId:string; section:"reading"|"listening";
  status:"in_progress"|"abandoned"; startedAt:string; lastSeenAt:string;
  registered:boolean; answeredCount:number; correctCount:number; assignedCount:number;
};
type MarathonAdminResponse = {
  itemOrder:number; setId:string; testPosition:number; itemId:string; itemVersion:number;
  difficulty:1|2|3; requestedDifficulty:1|2|3; recentAccuracy:number|null;
  policyVersion:string; question:Question; selectedOption:number|null;
  correctAnswer:number; explanation:string; isCorrect:boolean|null;
  responseTimeMs:number; selectionCount:number; submittedAt:string|null; titleKo:string;
};
```

<a id="errors"></a>
## 공통 오류


```json
{
  "error": {
    "code": "ADMIN_FORBIDDEN",
    "message": "This account is not an administrator"
  }
}
```

| 상태 | 코드·조건 |
|---|---|
| 400 | VALIDATION_ERROR (error.issues 배열 포함), 잘못된 본문·경로·쿼리 |
| 401 | SESSION_TOKEN_REQUIRED (헤더 누락), ADMIN_AUTH_REQUIRED (무효·만료 토큰) |
| 403 | ADMIN_FORBIDDEN (활성 관리자 아님) |
| 404 | NOT_FOUND (리소스 또는 경로 없음) |
| 413 | 프레임워크의 파일·본문 크기 제한 오류 |
| 429 | 호출 제한 초과 |
| 503 | AUTH_NOT_CONFIGURED / STORAGE_NOT_CONFIGURED |
| 500 | INTERNAL_ERROR (처리하지 않은 내부 오류) |

## 구현 근거

- [관리자 라우트](../backend/src/routes/admin/), [인증](../backend/src/admin/auth.ts), [저장소 반환값](../backend/src/admin/repositories/)
- [내보내기](../backend/src/admin/exports/), [사전등록](../backend/src/admin/preregistrations/), [마라톤 후보](../backend/src/marathon/inventory.ts)
- [기존 API 테스트](../backend/tests/api/), [일반 API](api.md), [DB 구조](database.md)
