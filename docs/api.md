# 일반 API 명세

## 목차

- [공통 호출 규칙과 인증](#common)
- [응답 데이터 구조](#models)
- [서버 상태·모의고사](#exams)
- [시험 세션·답안·이벤트·음원](#sessions)
- [제출·중단·결과 이메일·결과 조회](#results)
- [사전등록](#preregistration)
- [마라톤](#marathon)
- [오류와 호출 순서](#errors)

아래 각 기능의 표에서 개별 API 설명으로 이동할 수 있습니다. 코드 기준: 2026-10-07. 실제 운영 서버의 배포 상태를 확인한 문서는 아닙니다.

<a id="common"></a>
## 공통 호출 규칙과 인증

- 기본 주소: `http://localhost:4000`. 운영에서는 백엔드 주소로 교체합니다. 프론트엔드 주소와 구분합니다.
- 본문이 있는 요청은 기본적으로 `Content-Type: application/json`입니다. 응답은 JSON이며 날짜·시간은 ISO 8601 문자열입니다.
- 예시 UUID·토큰·문항은 설명용입니다. 앞선 호출에서 받은 실제 값을 넣어야 합니다.
- 예시는 Bash 형식입니다. Windows PowerShell에서는 `curl.exe`를 사용하고 JSON 인수 전달 문제가 있으면 JSON 파일을 만들어 `--data-binary @request.json`으로 전달합니다.
- 경로의 `sessionId`, `audioAssetId`는 UUID입니다. 일반 시험 `itemOrder`는 정수 1~100, 마라톤 `order`는 정수 1~2,147,483,647입니다.
- 전역 제한은 IP당 1분 240회, JSON 본문 최대 6 MiB입니다. 허용된 Origin만 CORS 접근할 수 있습니다.
- 요청에 `durationMs`가 있으면 0 이상의 유한한 숫자가 필수이며, 저장 시 반올림 후 최대 60,000ms로 제한됩니다.

| 토큰 | 발급·획득 | 사용처 |
|---|---|---|
| 세션 토큰 | `POST /v1/sessions`의 `token` | 해당 일반 시험 세션 |
| 결과 토큰 | 발송된 결과 이메일의 링크 | `GET /v1/results` |
| 브라우저 토큰 | `POST /v1/marathon/browsers`의 `token` | 마라톤 API 전체 및 일반 세션 생성의 선택적 `browserToken` |

인증 헤더는 `Authorization: Bearer TOKEN`이며 토큰들은 서로 대체할 수 없습니다. `Bearer`의 대소문자도 코드와 동일해야 합니다. 일반 세션 생성 시 `browserToken`은 헤더가 아닌 본문으로 전달합니다.

<a id="models"></a>
## 응답 데이터 구조

아래 타입에서 `?`는 필드 생략 가능, `| null`은 필드 값이 null일 수 있음을 뜻합니다. UUID는 문자열, 정수·점수는 JSON number입니다.

```typescript
export type ExamMode = "timed" | "practice";

export interface Exam {
  id: string;
  slug: string;
  titleEn: string;
  titleKo: string;
  descriptionEn: string;
  descriptionKo: string;
  durationSeconds: number;
  questionCount: number;
  maxScore: number;
  section: "reading" | "listening" | "writing";
}

export interface VisualOption { number: number; imageUrl: string }
export interface MaterialVisual { imageUrl: string; description: string }
export interface TranscriptTurn { speaker: string; text: string }

export interface Question {
  itemOrder: number;
  section: string;
  testPosition: number;
  itemId: string;
  itemVersion: number;
  itemType: string;
  stem: string;
  passage: string;
  auxiliaryText: string;
  questionPrompt: string;
  highlightText: string;
  choices: string[];
  visualOptions: Array<{ number: number; imageUrl: string }>;
  materialVisual: { imageUrl: string; description: string } | null;
  audioAssetId: string | null;
  repeatCount: number;
  transcript?: DialogueTranscriptTurn[];
  selectedOption: number | null;
}

export type DialogueTranscriptTurn = { speaker: string; text: string };


export interface TestSession {
  sessionId: string;
  userId: string;
  mode: ExamMode;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  rating: number | null;
  resultEmailSent: boolean;
  maskedResultEmail: string | null;
  resultLinkExpiresAt: string | null;
  serverTime: string;
  exam: { id: string; slug: string; titleEn: string; titleKo: string };
  questions: Question[];
}

export interface IncorrectQuestion extends Question {
  correctAnswer: number;
  explanation: string;
}

export interface Results {
  examId: string;
  sessionId: string;
  titleKo: string;
  titleEn: string;
  section: "reading" | "listening" | "writing";
  score: number;
  maxScore: number;
  submittedAt: string | null;
  incorrectCount: number;
  incorrect: IncorrectQuestion[];
}
```

`Question`에는 정답·해설이 포함되지 않습니다. 결과의 `IncorrectQuestion`에는 정답·해설 및 가능한 듣기 대본이 추가됩니다. 듣기 문제의 `stem`, `passage`, `auxiliaryText`는 빈 문자열입니다. `choices`는 문자열 배열, 이미지 선택지는 `visualOptions`입니다.

마라톤 상태:

```typescript
type MarathonState = {
  sessionId: string; section: "reading" | "listening";
  registered: boolean; registrationRequired: boolean;
  order: number; phase: "question" | "explanation";
  question: Question | null;
  result?: { correctAnswer: number; explanation: string; isCorrect: boolean };
};
```

마라톤은 답안 제출 후 `phase="explanation"`과 `result`를 반환합니다. 사전등록이 필요하면 `question`이 null일 수 있습니다. 제출한 문제는 등록이 필요한 상태에서도 해설과 함께 반환될 수 있습니다.

<a id="exams"></a>
## 서버 상태·모의고사

| API | 호출 |
|---|---|
| [서버 상태](#api-1) | `GET /health` |
| [공개 모의고사 목록](#api-2) | `GET /v1/exams` |

<a id="api-1"></a>
### 1. 서버 상태

`GET /health`

- 인증: 불필요
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/health"
```

응답

```json
{
  "ok": true,
  "service": "unigate-topik-api"
}
```

<a id="api-2"></a>
### 2. 공개 모의고사 목록

`GET /v1/exams`

- 인증: 불필요
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/v1/exams"
```

응답 구조: { exams: Exam[] }

```json
{
  "exams": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "slug": "reading-1",
      "titleEn": "Reading 1",
      "titleKo": "읽기 1회",
      "descriptionEn": "Reading practice",
      "descriptionKo": "읽기 연습",
      "durationSeconds": 4200,
      "questionCount": 50,
      "maxScore": 100,
      "section": "reading"
    }
  ]
}
```

공개된 시험만 표시 순서대로 반환합니다. 목록이 없으면 빈 배열입니다.

<a id="sessions"></a>
## 시험 세션·답안·이벤트·음원

| API | 호출 |
|---|---|
| [시험 세션 생성](#api-3) | `POST /v1/sessions` |
| [시험 세션 조회](#api-4) | `GET /v1/sessions/:sessionId` |
| [사용자 이벤트 기록](#api-5) | `POST /v1/sessions/:sessionId/items/:itemOrder/events` |
| [답안 저장](#api-6) | `PUT /v1/sessions/:sessionId/items/:itemOrder/answer` |
| [음원 재생 준비·기록](#api-7) | `POST /v1/sessions/:sessionId/audio/:audioAssetId/playback` |

<a id="api-3"></a>
### 3. 시험 세션 생성

`POST /v1/sessions`

- 인증: 불필요
- 성공: `201`

| 본문 필드 | 형식·제약 | 필수 |
|---|---|---|
| mockTestId | UUID | 예 |
| mode | timed 또는 practice | 예 |
| browserToken | 문자열 32~128자, 기존 브라우저 토큰 | 아니요 |

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/sessions" -H "Content-Type: application/json" -d '{"mockTestId":"11111111-1111-4111-8111-111111111111","mode":"practice"}'
```

응답

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "userId": "22222222-2222-4222-8222-222222222222",
  "token": "EXAMPLE_SESSION_TOKEN"
}
```

`timed`는 제한 시간이 있고 `practice`는 만료 시각이 없습니다. 발급 토큰은 해당 세션에 사용합니다.

주요 오류: 404 NOT_FOUND, 401 INVALID_SESSION_TOKEN(전달한 브라우저 토큰 오류), 503 INCOMPLETE_EXAM

<a id="api-4"></a>
### 4. 시험 세션 조회

`GET /v1/sessions/:sessionId`

- 인증: 세션 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer SESSION_TOKEN"
```

응답 구조: TestSession

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "userId": "22222222-2222-4222-8222-222222222222",
  "mode": "practice",
  "status": "in_progress",
  "startedAt": "2026-10-07T00:00:00.000Z",
  "expiresAt": null,
  "submittedAt": null,
  "rating": null,
  "resultEmailSent": false,
  "maskedResultEmail": null,
  "resultLinkExpiresAt": null,
  "serverTime": "2026-10-07T00:00:00.000Z",
  "exam": {
    "id": "11111111-1111-4111-8111-111111111111",
    "slug": "reading-1",
    "titleEn": "Reading 1",
    "titleKo": "읽기 1회"
  },
  "questions": [
    {
      "itemOrder": 1,
      "section": "reading",
      "testPosition": 1,
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "itemType": "grammar",
      "stem": "알맞은 답을 고르십시오.",
      "passage": "",
      "auxiliaryText": "",
      "questionPrompt": "",
      "highlightText": "",
      "choices": [
        "보기 1",
        "보기 2",
        "보기 3",
        "보기 4"
      ],
      "visualOptions": [],
      "materialVisual": null,
      "audioAssetId": null,
      "repeatCount": 1,
      "selectedOption": null
    }
  ]
}
```

시간이 만료된 시험은 조회 중 자동 제출될 수 있습니다. `resultEmailSent`는 사용 가능한 accepted 이메일 발송 이력 존재 여부이며 수신자에게 실제 도착했는지를 의미하지 않습니다.

주요 오류: 401 INVALID_SESSION_TOKEN, 404 NOT_FOUND

<a id="api-5"></a>
### 5. 사용자 이벤트 기록

`POST /v1/sessions/:sessionId/items/:itemOrder/events`

- 인증: 세션 토큰
- 성공: `200`

본문 필수: `clientEventId` UUID, `eventType` = presented / hidden / heartbeat, `durationMs` number.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/items/1/events" -H "Authorization: Bearer SESSION_TOKEN" -H "Content-Type: application/json" -d '{"clientEventId":"22222222-2222-4222-8222-222222222222","eventType":"heartbeat","durationMs":1000}'
```

응답

```json
{
  "accepted": true,
  "submitted": false
}
```

동일 작업 재전송은 같은 `clientEventId`를 사용합니다. 중복이면 `accepted:false`. 시간 만료 시 `{ "accepted": false, "submitted": true }`를 반환합니다.

주요 오류: 401 INVALID_SESSION_TOKEN, 404 NOT_FOUND, 409 SESSION_CLOSED

<a id="api-6"></a>
### 6. 답안 저장

`PUT /v1/sessions/:sessionId/items/:itemOrder/answer`

- 인증: 세션 토큰
- 성공: `200`

본문 필수: `clientEventId` UUID, `selectedOption` 정수 1~4, `durationMs` number.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X PUT "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/items/1/answer" -H "Authorization: Bearer SESSION_TOKEN" -H "Content-Type: application/json" -d '{"clientEventId":"22222222-2222-4222-8222-222222222222","selectedOption":2,"durationMs":1000}'
```

응답

```json
{
  "accepted": true,
  "submitted": false
}
```

동일 작업 재전송은 같은 `clientEventId`를 사용합니다. 중복이면 `accepted:false`. 시간 만료 시 `{ "accepted": false, "submitted": true }`를 반환합니다.

주요 오류: 401 INVALID_SESSION_TOKEN, 404 NOT_FOUND, 409 SESSION_CLOSED

<a id="api-7"></a>
### 7. 음원 재생 준비·기록

`POST /v1/sessions/:sessionId/audio/:audioAssetId/playback`

- 인증: 세션 토큰
- 성공: `200`

본문 필수: `clientPlayId` UUID, `eventType` = prepared / started / completed / interrupted.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/audio/11111111-1111-4111-8111-111111111111/playback" -H "Authorization: Bearer SESSION_TOKEN" -H "Content-Type: application/json" -d '{"clientPlayId":"22222222-2222-4222-8222-222222222222","eventType":"prepared"}'
```

응답

```json
{
  "submitted": false,
  "playNumber": 1,
  "maxPlays": 1,
  "audioUrl": "https://example.com/signed-audio.wav"
}
```

`prepared`에서만 `audioUrl`을 반환합니다. 재생 시작 후 같은 clientPlayId로 started, completed 또는 interrupted를 보냅니다. 나머지 성공 응답은 submitted·playNumber·maxPlays이며 만료 시 submitted:true만 반환합니다. practice의 maxPlays는 null. timed에서는 음원별 허용 횟수를 검사하며 exam_track_v2/v3/v4는 반복을 포함한 음원 1회입니다.

주요 오류: 409 AUDIO_REPLAY_LIMIT / AUDIO_NOT_STARTED / SESSION_CLOSED, 404 NOT_FOUND

<a id="results"></a>
## 제출·중단·결과 이메일·결과 조회

| API | 호출 |
|---|---|
| [시험 제출](#api-8) | `POST /v1/sessions/:sessionId/submit` |
| [시험 중단](#api-9) | `POST /v1/sessions/:sessionId/abandon` |
| [결과 이메일 요청](#api-10) | `POST /v1/sessions/:sessionId/result-email` |
| [이메일 링크로 결과 조회](#api-11) | `GET /v1/results` |

<a id="api-8"></a>
### 8. 시험 제출

`POST /v1/sessions/:sessionId/submit`

- 인증: 세션 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X POST "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/submit" -H "Authorization: Bearer SESSION_TOKEN"
```

응답

```json
{
  "status": "submitted",
  "resultEmailRequired": true
}
```

이미 제출한 세션의 재요청도 같은 형식입니다. 점수·오답은 결과 조회 API로 확인합니다.

주요 오류: 409 SESSION_CLOSED(중단된 세션)

<a id="api-9"></a>
### 9. 시험 중단

`POST /v1/sessions/:sessionId/abandon`

- 인증: 세션 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X POST "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/abandon" -H "Authorization: Bearer SESSION_TOKEN"
```

응답

```json
{
  "status": "abandoned"
}
```

이미 중단된 세션에도 같은 결과를 반환합니다.

주요 오류: 409 SESSION_ALREADY_SUBMITTED

<a id="api-10"></a>
### 10. 결과 이메일 요청

`POST /v1/sessions/:sessionId/result-email`

- 인증: 세션 토큰
- 성공: `202`

| 본문 필드 | 형식·제약 | 필수 |
|---|---|---|
| rating | 정수 1~5 | 예 |
| locale | ko 또는 en | 예 |
| email | 앞뒤 공백 제거, 이메일, 최대 320자 | 예 |
| preregistration | {requestId: UUID, consentVersion: "preregistration_v1"} | 아니요 |

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/sessions/11111111-1111-4111-8111-111111111111/result-email" -H "Authorization: Bearer SESSION_TOKEN" -H "Content-Type: application/json" -d '{"rating":5,"locale":"ko","email":"learner@example.com"}'
```

응답

```json
{
  "emailAccepted": true,
  "maskedEmail": "l***r@example.com",
  "expiresAt": "2026-11-06T00:00:00.000Z"
}
```

이메일 업체가 요청을 수락했다는 뜻이며 도착 보장은 아닙니다. 결과 토큰은 이 응답에 없고 이메일 링크에 포함됩니다. 링크 유효 기간은 생성 시점부터 30일입니다. 선택적 사전등록은 메일 전송 전에 별도 저장되므로 메일 실패 시에도 등록이 남을 수 있습니다.

주요 오류: 409 SESSION_NOT_SUBMITTED / PREREGISTRATION_REQUEST_CONFLICT, 429 RESULT_EMAIL_HOURLY_LIMIT_REACHED, 503 RESULT_EMAIL_DISABLED / RESULT_EMAIL_MONTHLY_LIMIT_REACHED, 502 RESULT_EMAIL_SEND_FAILED

<a id="api-11"></a>
### 11. 이메일 링크로 결과 조회

`GET /v1/results`

- 인증: 결과 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/v1/results" -H "Authorization: Bearer RESULT_TOKEN"
```

응답 구조: Results

```json
{
  "examId": "11111111-1111-4111-8111-111111111111",
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "titleEn": "Reading 1",
  "titleKo": "읽기 1회",
  "section": "reading",
  "score": 98,
  "maxScore": 100,
  "submittedAt": "2026-10-07T00:00:00.000Z",
  "incorrectCount": 1,
  "incorrect": [
    {
      "itemOrder": 1,
      "section": "reading",
      "testPosition": 1,
      "itemId": "22222222-2222-4222-8222-222222222222",
      "itemVersion": 1,
      "itemType": "grammar",
      "stem": "알맞은 답을 고르십시오.",
      "passage": "",
      "auxiliaryText": "",
      "questionPrompt": "",
      "highlightText": "",
      "choices": [
        "보기 1",
        "보기 2",
        "보기 3",
        "보기 4"
      ],
      "visualOptions": [],
      "materialVisual": null,
      "audioAssetId": null,
      "repeatCount": 1,
      "selectedOption": 2,
      "correctAnswer": 1,
      "explanation": "1번이 정답입니다."
    }
  ]
}
```

`Cache-Control: no-store`. `incorrect`에는 오답과 미응답 문항이 포함되며 만점이면 빈 배열입니다.

주요 오류: 401 RESULT_TOKEN_REQUIRED / INVALID_RESULT_TOKEN, 410 RESULT_LINK_EXPIRED

<a id="preregistration"></a>
## 사전등록

| API | 호출 |
|---|---|
| [랜딩 페이지 사전등록](#api-12) | `POST /v1/preregistrations` |

<a id="api-12"></a>
### 12. 랜딩 페이지 사전등록

`POST /v1/preregistrations`

- 인증: 불필요
- 성공: `201`

본문 필수: `email` 이메일·최대 320자(앞뒤 공백 제거), `locale` ko/en, `requestId` UUID, `consentVersion` 문자열 "preregistration_v1". 별도 boolean 동의 필드는 없으며 해당 동의 버전으로 요청하면 개인정보·마케팅 동의를 함께 저장합니다.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/preregistrations" -H "Content-Type: application/json" -d '{"requestId":"22222222-2222-4222-8222-222222222222","consentVersion":"preregistration_v1","email":"learner@example.com","locale":"ko"}'
```

응답

```json
{
  "registrationId": "001-00000001"
}
```

`Cache-Control: no-store`. 같은 requestId와 동일한 입력은 기존 등록 번호를 반환합니다. 번호는 문자열이며 UUID가 아닙니다. 랜딩 001, 시험 결과 002, 마라톤 003 접두사를 사용합니다.

주요 오류: 409 PREREGISTRATION_REQUEST_CONFLICT

<a id="marathon"></a>
## 마라톤

| API | 호출 |
|---|---|
| [브라우저 식별자 생성](#api-13) | `POST /v1/marathon/browsers` |
| [진행 중 마라톤 목록](#api-14) | `GET /v1/marathon/sessions` |
| [마라톤 시작·재시작](#api-15) | `POST /v1/marathon/sessions` |
| [마라톤 상태 조회](#api-16) | `GET /v1/marathon/sessions/:sessionId` |
| [다음 문항 요청](#api-17) | `POST /v1/marathon/sessions/:sessionId/next` |
| [마라톤 답안 제출](#api-18) | `PUT /v1/marathon/sessions/:sessionId/items/:order/answer` |
| [마라톤 이벤트 기록](#api-19) | `POST /v1/marathon/sessions/:sessionId/items/:order/events` |
| [마라톤 사전등록](#api-20) | `POST /v1/marathon/sessions/:sessionId/preregistration` |
| [마라톤 음원 재생](#api-21) | `POST /v1/marathon/sessions/:sessionId/audio/:audioAssetId/playback` |

<a id="api-13"></a>
### 13. 브라우저 식별자 생성

`POST /v1/marathon/browsers`

- 인증: 불필요
- 성공: `201`

요청 본문: 없음.

```bash
curl -X POST "http://localhost:4000/v1/marathon/browsers"
```

응답

```json
{
  "browserId": "11111111-1111-4111-8111-111111111111",
  "token": "EXAMPLE_BROWSER_TOKEN"
}
```

token을 보관하여 이후 마라톤 인증에 사용합니다. 세션마다 재발급하면 기존 진행 상태와 연결되지 않습니다.

<a id="api-14"></a>
### 14. 진행 중 마라톤 목록

`GET /v1/marathon/sessions`

- 인증: 브라우저 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/v1/marathon/sessions" -H "Authorization: Bearer BROWSER_TOKEN"
```

응답

```json
{
  "sessions": [
    {
      "sessionId": "11111111-1111-4111-8111-111111111111",
      "section": "reading",
      "startedAt": "2026-10-07T00:00:00.000Z",
      "answeredCount": 0
    }
  ],
  "registered": false
}
```

현재 브라우저의 in_progress 세션만 반환합니다. startedAt은 ISO 문자열, answeredCount는 제출한 문항 수입니다.

<a id="api-15"></a>
### 15. 마라톤 시작·재시작

`POST /v1/marathon/sessions`

- 인증: 브라우저 토큰
- 성공: `200`

본문: `section` reading/listening 필수, `requestId` UUID 필수, `restart` boolean 선택(기본 false).

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/marathon/sessions" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"section":"reading","requestId":"22222222-2222-4222-8222-222222222222","restart":false}'
```

응답 구조: MarathonState

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "section": "reading",
  "registered": false,
  "registrationRequired": false,
  "order": 1,
  "phase": "question",
  "question": {
    "itemOrder": 1,
    "section": "reading",
    "testPosition": 1,
    "itemId": "22222222-2222-4222-8222-222222222222",
    "itemVersion": 1,
    "itemType": "grammar",
    "stem": "알맞은 답을 고르십시오.",
    "passage": "",
    "auxiliaryText": "",
    "questionPrompt": "",
    "highlightText": "",
    "choices": [
      "보기 1",
      "보기 2",
      "보기 3",
      "보기 4"
    ],
    "visualOptions": [],
    "materialVisual": null,
    "audioAssetId": null,
    "repeatCount": 1,
    "selectedOption": null
  }
}
```

같은 영역의 진행 중 세션이 있으면 재사용합니다. restart:true이면 이전 세션을 abandoned로 변경합니다. 무료 응답 수는 브라우저 단위로 누적되어 재시작으로 초기화되지 않습니다.

주요 오류: 409 REQUEST_CONFLICT / MARATHON_CLOSED / MARATHON_MEDIA_CHANGED, 503 MARATHON_NO_QUESTIONS

<a id="api-16"></a>
### 16. 마라톤 상태 조회

`GET /v1/marathon/sessions/:sessionId`

- 인증: 브라우저 토큰
- 성공: `200`

요청 본문: 없음.

```bash
curl -X GET "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111" -H "Authorization: Bearer BROWSER_TOKEN"
```

응답 구조: MarathonState

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "section": "reading",
  "registered": false,
  "registrationRequired": false,
  "order": 1,
  "phase": "question",
  "question": {
    "itemOrder": 1,
    "section": "reading",
    "testPosition": 1,
    "itemId": "22222222-2222-4222-8222-222222222222",
    "itemVersion": 1,
    "itemType": "grammar",
    "stem": "알맞은 답을 고르십시오.",
    "passage": "",
    "auxiliaryText": "",
    "questionPrompt": "",
    "highlightText": "",
    "choices": [
      "보기 1",
      "보기 2",
      "보기 3",
      "보기 4"
    ],
    "visualOptions": [],
    "materialVisual": null,
    "audioAssetId": null,
    "repeatCount": 1,
    "selectedOption": null
  }
}
```

주요 오류: 404 NOT_FOUND, 409 MARATHON_CLOSED

<a id="api-17"></a>
### 17. 다음 문항 요청

`POST /v1/marathon/sessions/:sessionId/next`

- 인증: 브라우저 토큰
- 성공: `200`

본문 필수: `afterOrder` 정수 0~2,147,483,646. 현재 문항 순서이며 아직 문항이 없으면 0.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111/next" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"afterOrder":1}'
```

응답 구조: MarathonState

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "section": "reading",
  "registered": false,
  "registrationRequired": false,
  "order": 2,
  "phase": "question",
  "question": {
    "itemOrder": 2,
    "section": "reading",
    "testPosition": 1,
    "itemId": "22222222-2222-4222-8222-222222222222",
    "itemVersion": 1,
    "itemType": "grammar",
    "stem": "알맞은 답을 고르십시오.",
    "passage": "",
    "auxiliaryText": "",
    "questionPrompt": "",
    "highlightText": "",
    "choices": [
      "보기 1",
      "보기 2",
      "보기 3",
      "보기 4"
    ],
    "visualOptions": [],
    "materialVisual": null,
    "audioAssetId": null,
    "repeatCount": 1,
    "selectedOption": null
  }
}
```

현재 문항 제출 후 호출합니다. 사전등록이 필요하면 새 문항을 발급하지 않고 현재 상태를 반환합니다. 바로 이전 afterOrder로 재시도하면 이미 발급한 상태를 반환합니다.

주요 오류: 409 MARATHON_STALE / MARATHON_ANSWER_REQUIRED / MARATHON_MEDIA_CHANGED, 503 MARATHON_NO_QUESTIONS

<a id="api-18"></a>
### 18. 마라톤 답안 제출

`PUT /v1/marathon/sessions/:sessionId/items/:order/answer`

- 인증: 브라우저 토큰
- 성공: `200`

본문 필수: `requestId` UUID, `selectedOption` 정수 1~4, `durationMs` number, `selectionCount` 정수 1~1,000,000.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X PUT "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111/items/1/answer" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"requestId":"22222222-2222-4222-8222-222222222222","selectedOption":1,"durationMs":1500,"selectionCount":1}'
```

응답 구조: MarathonState

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "section": "reading",
  "registered": false,
  "registrationRequired": false,
  "order": 1,
  "phase": "explanation",
  "question": {
    "itemOrder": 1,
    "section": "reading",
    "testPosition": 1,
    "itemId": "22222222-2222-4222-8222-222222222222",
    "itemVersion": 1,
    "itemType": "grammar",
    "stem": "알맞은 답을 고르십시오.",
    "passage": "",
    "auxiliaryText": "",
    "questionPrompt": "",
    "highlightText": "",
    "choices": [
      "보기 1",
      "보기 2",
      "보기 3",
      "보기 4"
    ],
    "visualOptions": [],
    "materialVisual": null,
    "audioAssetId": null,
    "repeatCount": 1,
    "selectedOption": 1
  },
  "result": {
    "correctAnswer": 1,
    "explanation": "정답 해설",
    "isCorrect": true
  }
}
```

제출은 확정이며 동일 requestId·답안으로 재전송할 수 있습니다. 미등록 브라우저는 읽기·듣기를 합쳐 3문항 제출 후 사전등록이 필요합니다.

주요 오류: 403 MARATHON_REGISTRATION_REQUIRED, 409 MARATHON_STALE / MARATHON_ALREADY_ANSWERED

<a id="api-19"></a>
### 19. 마라톤 이벤트 기록

`POST /v1/marathon/sessions/:sessionId/items/:order/events`

- 인증: 브라우저 토큰
- 성공: `200`

본문 필수: `requestId` UUID, `eventType` presented/hidden/heartbeat/selection, `durationMs` number. `selectedOption` 정수 1~4는 selection일 때만 필수이며 다른 이벤트에는 생략해야 합니다.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111/items/1/events" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"requestId":"22222222-2222-4222-8222-222222222222","eventType":"selection","durationMs":1000,"selectedOption":1}'
```

응답

```json
{
  "accepted": true
}
```

현재 미제출 문항에만 반영합니다. 현재 문항이 아니거나 제출·등록 제한 상태이면 200과 accepted:false를 반환합니다. 중복 요청은 추가 반영 없이 accepted:true일 수 있습니다.

<a id="api-20"></a>
### 20. 마라톤 사전등록

`POST /v1/marathon/sessions/:sessionId/preregistration`

- 인증: 브라우저 토큰
- 성공: `200`

본문 필수: `email` 이메일·최대 320자(앞뒤 공백 제거), `locale` ko/en, `requestId` UUID, `consentVersion` 문자열 "preregistration_v1". 별도 boolean 동의 필드는 없으며 해당 동의 버전으로 요청하면 개인정보·마케팅 동의를 함께 저장합니다.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111/preregistration" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"requestId":"22222222-2222-4222-8222-222222222222","consentVersion":"preregistration_v1","email":"learner@example.com","locale":"ko"}'
```

응답

```json
{
  "registrationId": "003-00000001"
}
```

이미 등록된 브라우저이면 보관된 registrationId를 반환합니다(저장 상태에 따라 null 가능). 등록 후 상태를 다시 조회하고 next로 진행합니다.

주요 오류: 409 PREREGISTRATION_REQUEST_CONFLICT / MARATHON_CLOSED

<a id="api-21"></a>
### 21. 마라톤 음원 재생

`POST /v1/marathon/sessions/:sessionId/audio/:audioAssetId/playback`

- 인증: 브라우저 토큰
- 성공: `200`

본문 필수: `clientPlayId` UUID, `eventType` prepared/started/completed/interrupted.

요청 본문: 아래 예시 및 필드 설명 참조.

```bash
curl -X POST "http://localhost:4000/v1/marathon/sessions/11111111-1111-4111-8111-111111111111/audio/11111111-1111-4111-8111-111111111111/playback" -H "Authorization: Bearer BROWSER_TOKEN" -H "Content-Type: application/json" -d '{"clientPlayId":"22222222-2222-4222-8222-222222222222","eventType":"prepared"}'
```

응답

```json
{
  "submitted": false,
  "maxPlays": null,
  "audioUrl": "https://example.com/signed-audio.wav"
}
```

현재 문항의 음원만 사용할 수 있습니다. 재생 횟수 제한이 없으며 playNumber는 반환하지 않습니다. prepared 외에는 audioUrl을 생략합니다. 제출 후에도 현재 문항 해설용 재생이 가능합니다.

주요 오류: 403 MARATHON_REGISTRATION_REQUIRED, 404 NOT_FOUND, 409 MARATHON_CLOSED

<a id="errors"></a>
## 오류와 호출 순서

공통 오류 형식:

```json
{
  "error": {
    "code": "SESSION_TOKEN_REQUIRED",
    "message": "Session token required"
  }
}
```

- 잘못된 요청: 400 `VALIDATION_ERROR`, `error.issues`에 Zod 검증 상세 배열이 추가됩니다.
- 토큰 누락: 401 `SESSION_TOKEN_REQUIRED` 또는 결과 API의 `RESULT_TOKEN_REQUIRED`.
- 잘못된 세션·브라우저 토큰: 401 `INVALID_SESSION_TOKEN`.
- 없는 리소스: 404 `NOT_FOUND`. 예외적으로 존재하지 않는 문항에 이벤트를 기록하면 DB 제약 오류가 500으로 처리될 수 있습니다.
- 호출 제한: 429. 프레임워크 오류는 `error.code`에 해당 오류 코드를 포함합니다.
- 예기치 않은 서버 오류: 500 `INTERNAL_ERROR`.

일반 시험 호출 순서: exams → sessions 생성 → sessions 조회 → 이벤트·답안·음원 기록 → submit → result-email → 이메일의 결과 토큰으로 results 조회.

마라톤 호출 순서: browsers 생성 → sessions 시작 → 이벤트·답안 제출 → 해설 표시 → 필요하면 preregistration → next. 브라우저 토큰을 유지하며 목록·상태 조회로 재개합니다.

일반 이벤트·답안은 clientEventId, 사전등록·마라톤 변경 요청은 requestId를 재시도 중 유지합니다. result-email에는 발송 자체의 멱등키가 없으므로 재호출이 추가 발송을 일으킬 수 있습니다.

## 구현 근거

- [HTTP 라우트](../backend/src/routes/public-routes.ts), [마라톤 라우트](../backend/src/routes/marathon-routes.ts), [사전등록 라우트](../backend/src/routes/preregistration-routes.ts)
- [시험 반환값·처리](../backend/src/exam/repository.ts), [문항 응답 변환](../backend/src/exam/domain.ts), [마라톤 처리](../backend/src/marathon/repository.ts)
- [요청 공통 설정·오류](../backend/src/app.ts), [사전등록 검증](../backend/src/preregistration/validation.ts)
- 관련 문서: [관리자 API](admin-api.md), [데이터베이스 구조](database.md)
