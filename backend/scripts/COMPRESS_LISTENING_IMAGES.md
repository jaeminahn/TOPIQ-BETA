# 운영 환경 기존 듣기 이미지 압축

기존 Supabase 이미지를 내려받아 **최대 440×330px, WebP 품질 85**로 변환합니다.
관리자 업로드·AI 생성에 적용한 공통 압축 함수를 그대로 사용합니다.
화면 표시 크기와 문항·이미지 ID는 바꾸지 않습니다.

## 운영 환경 준비

운영 DB에 접근할 수 있는 로컬 체크아웃의 **프로젝트 루트**에서 명령을 실행합니다.
Node.js 22 이상과 `tsx`를 포함한 프로젝트 개발 의존성이 설치되어 있어야 합니다.
이 작업은 소스 체크아웃에서 직접 실행하며 API 서버 배포가 필요하지 않습니다.

`backend/.env.production`에 **운영 DB와 운영 이미지 Storage** 접속값을 설정합니다.
실제 키나 환경 파일은 Git에 커밋하지 않습니다.

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@PRODUCTION_DB_HOST:5432/DATABASE
DATABASE_SSL=require
SUPABASE_URL=https://PRODUCTION_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PRODUCTION_SERVICE_ROLE_KEY
```

아래의 `images:compress:production` 명령은 `--env-file .env.production`을 자동으로 붙여
해당 파일만 읽습니다. 파일이 없으면 중단하고 다른 환경 파일로 대체하지 않습니다.
이미 터미널에 설정된 환경변수는 파일보다 우선하므로 개발 DB 접속값이 남아 있지 않은지 확인하세요.
실행 시작 시 출력되는 DB 호스트와 Storage 주소가 운영 대상인지 미리보기에서 확인합니다.
메일·AI 제공자 설정은 필요 없습니다.
**옵션으로 넘기는 상대 경로는 모두 `backend/` 기준**입니다.

## 명령어 요약

프로젝트 루트에서 순서대로 실행합니다. 적용 결과를 확인한 후 다음 적용 명령을 실행하세요.

```powershell
# 1. 최대 10개 후보 미리보기 (원격 변경 없음)
pnpm --filter @unigate/topik-api images:compress:production --dry-run --limit 10

# 2. 최대 10개 후보 적용 후 운영 시험 화면 확인
pnpm --filter @unigate/topik-api images:compress:production --apply --limit 10

# 3. 나머지 전체 적용
pnpm --filter @unigate/topik-api images:compress:production --apply

# 복구가 필요할 때만 실행: 실제 적용 기록의 절대 경로로 교체
pnpm --filter @unigate/topik-api images:compress:production --rollback "C:\path\to\apply-report.jsonl"
```

운영 별칭은 아래 직접 실행과 같습니다.

```powershell
pnpm --filter @unigate/topik-api exec tsx scripts/compress-listening-images.ts --env-file .env.production --dry-run --limit 10
```

## 1. 변경 없이 미리보기

원본 다운로드와 실제 압축을 수행해 용량을 비교하지만, Storage 업로드나 DB 변경은 하지 않습니다.
다운로드 트래픽과 로컬 기록 파일은 발생합니다. `--dry-run`을 생략해도 미리보기입니다.
모든 후보를 확인하려면 `--limit 10`을 생략합니다.

출력의 `preview` 행에 원본 바이트, 압축 바이트, 절감률이 표시됩니다.
`summary.changed`는 미리보기에서는 변환 가능한 개수, 적용에서는 변경한 개수입니다.
`originalBytes`와 `compressedBytes`는 해당 항목들의 합계입니다. 실패가 있으면 `failed`가 증가하고 종료 코드는 1입니다.
실패 행의 `stage`는 실패 단계(`download`, `decode`, `compress`, `journal`, `upload`, `verify-upload`, `update-binding`)입니다.

## 2. 일부 적용 후 전체 적용

새 WebP는 `optimized/listening-440-v1/` 아래 고유 경로에 저장합니다.
업로드한 파일을 다시 내려받아 바이트 해시를 확인한 다음, DB의 경로·URL·MIME·용량만 갱신합니다.
처리 중 이미지 연결이 바뀌면 덮어쓰지 않고 해당 항목을 실패로 기록합니다.
화면을 이미 열어 둔 사용자는 새로고침 또는 다음 조회부터 새 URL을 받습니다.

처리 대상은 `is_current=true`인 듣기 선택지의 PNG·JPEG·WebP입니다.
과거 문항 버전에 연결된 현재 이미지도 포함합니다. 읽기 자료, SVG, 비활성 자산은 제외합니다.
이미 이 스크립트로 처리한 경로와 440×330 이하의 WebP는 건너뜁니다.
용량이 줄지 않는 이미지도 건너뜁니다. `--limit`은 성공 개수가 아닌 후보 개수 제한입니다.
같은 명령을 재실행해 실패한 항목을 재시도할 수 있습니다.

## 3. 실행 기록과 복구

기본 기록은 `backend/.image-compression-backups/`에 JSONL로 저장하며,
실행 시작 시 **절대 경로**를 출력합니다. 적용 기록은 반드시 보관하세요.
별도 경로는 `--report .image-compression-backups/my-apply.jsonl`로 지정합니다.
기존 기록 파일은 덮어쓰지 않습니다. 이 폴더는 Git에서 제외됩니다.

```powershell
# 적용 실행 때 출력된 실제 기록 경로로 교체
pnpm --filter @unigate/topik-api images:compress:production --rollback "C:\path\to\apply-report.jsonl"
```

`--rollback`은 즉시 복구를 실행합니다. `--apply`나 `--dry-run`을 함께 붙이지 않습니다.
적용할 때와 같은 운영 DB·스토리지 연결을 사용해야 합니다.
10개 시범 적용과 나머지 전체 적용은 기록 파일이 각각 생깁니다.
모두 복구하려면 최신 적용 기록부터 각각 `--rollback`을 실행합니다.
DB 호스트·포트·DB명·사용자 또는 Storage 주소가 바뀌면 다른 대상으로 판단해 중단합니다.
비밀번호와 서비스 키 변경은 허용합니다.

복구는 현재 연결이 해당 실행에서 만든 파일을 가리키는 경우에만 수행합니다.
원본이 여전히 존재하고 해시도 같은지 확인한 후 예전 연결로 돌립니다.
나중에 관리자가 교체한 이미지나 이미 복구한 이미지는 건너뜁니다.
원본 경로, 새 경로, 원본 해시를 외부 쓰기 **전에 디스크에 동기화**하므로 중간 종료나
DB 응답 유실 후에도 같은 적용 기록으로 복구할 수 있습니다.

원본과 새 파일은 적용·실패·복구 어느 경우에도 자동 삭제하지 않습니다.
따라서 다운로드 용량은 줄어도 원본 보관 중에는 Storage 사용량이 늘 수 있고,
실패한 업로드의 새 파일이 남을 수도 있습니다. 원본 정리는 검증 완료 후 별도로 수행해야 합니다.
복구 기간에는 관리자에서 대상 이미지를 재생성하거나 삭제하는 작업을 피하는 것이 좋습니다.

## 도움말

```powershell
pnpm --filter @unigate/topik-api images:compress:production --help
```

도움말은 환경 파일이나 운영 연결 없이도 실행할 수 있습니다.

## 코드 위치

- `backend/scripts/compress-listening-images.ts`: 명령 해석, 환경 설정, DB·Storage 연결, 실행 기록.
- `backend/scripts/listening-image-backfill.ts`: 기존 이미지 일괄 변환·복구 처리.
- `backend/src/media/listening-image.ts`: 관리자 업로드·AI 생성에서도 사용하는 공통 압축 함수.

일회성 작업 코드는 `scripts/`에서 관리하고 서버의 `dist/` 빌드에서는 제외합니다.
스크립트도 타입 검사와 자동 테스트 대상으로 유지합니다.
이 스크립트 생성과 테스트만으로 실제 운영 DB나 Storage 이미지가 변경되지는 않습니다.
