# Clinical Memory Assistant MVP

물리치료 개인 임상 기억 보조 시스템의 첫 정적 프로토타입입니다. 현재 버전은 브라우저에서 바로 실행되는 정적 앱이며, 로컬 저장과 Supabase 클라우드 스냅샷 저장을 함께 사용합니다.

## 실행

`index.html`을 브라우저에서 열면 됩니다.

개발 서버로 확인하려면:

```bash
python3 -m http.server 4173
```

그리고 `http://localhost:4173`으로 접속합니다.

## 현재 포함된 흐름

- 내일 Appointment 확인
- 당일 최종 OCR 기반 Visit 후보 확정
- Whisper transcript 붙여넣기 또는 `.txt` 업로드
- 스케줄 캡쳐 OCR 텍스트 반영
- 의사 초진 차트 캡쳐 정보 저장
- GitHub Pages 배포 후 병원 Windows PC에서 스크린샷 붙여넣기
- 녹음 시간과 OCR Visit 시간 기반 추천 매칭 후보
- 환자 자동 생성
- 사용자 확인 후 Visit에 transcript/chart draft 연결
- Signal / tracking variables 추출
- 차트 초안 생성 및 복사
- 한국어 임상 용어 보정 사전
- JSON 내보내기/가져오기

## 데이터 관계

현재 앱 내부에서는 snapshot 동기화를 쓰지만, 구조는 아래 관계를 기준으로 유지합니다.

- `patients`: 환자 identity. `chartNumber/code`가 있으면 이름보다 우선합니다.
- `appointments`: 내일 또는 미래 예정 스케줄. 퇴근 전 다음날 예약표를 붙여넣어 생성합니다.
- `visits`: 오늘 실제 치료/마감 기록. 당일 최종 예약표 OCR 결과가 시간/이름/duration 기준 record가 됩니다.
- `rawInbox`: Whisper transcript, OCR 결과, 외부 AI 정리 텍스트가 확정 전 대기하는 공간입니다.
- `matchingCandidates`: raw inbox와 appointment/visit 사이의 추천 연결입니다. 자동 확정하지 않고 사용자 확인 후 연결합니다.

중요 원칙: Whisper transcript는 OCR Visit을 덮어쓰지 않고, 기존 Visit record에 연결됩니다.

## 다음 연결 지점

- Supabase 개별 테이블 동기화 고도화: `patients`, `appointments`, `visits`, `raw_inbox`, `matching_candidates`, `terms`
- MacBook watcher: Whisper Memos iCloud transcript 폴더 감시 후 `raw_inbox` 업로드
- OCR: 스케줄/의사 차트 캡쳐 이미지에서 텍스트 추출
- AI API: transcript에서 signal, hypothesis, progression, chart draft 생성

## Supabase 준비

현재 프로젝트 URL은 `https://mwwbqzdpnvnrvcdfxflh.supabase.co`로 설정되어 있습니다.

1. Supabase Dashboard에서 프로젝트를 엽니다.
2. SQL Editor에서 `supabase-schema.sql` 내용을 붙여넣고 실행합니다.
3. Project Settings > API에서 `anon public` key를 확인합니다.
4. 앱의 설정 화면에 Project URL과 anon key를 입력합니다.

만약 `Could not find the table 'public.app_snapshots'`가 뜨면 SQL 실행이 반영되지 않은 상태입니다. 먼저 `supabase-minimal-snapshot.sql`을 SQL Editor에서 실행하면 클라우드 저장 기능만 바로 테스트할 수 있습니다.

주의: `service_role` key는 브라우저 앱, GitHub, `.env.example`에 넣지 않습니다.

GitHub Pages 배포용 공개 설정은 `config.public.js`에 있습니다. 이 파일에는 Supabase publishable/anon key만 들어갑니다. `service_role` key, 이메일, 비밀번호는 절대 넣지 않습니다.

로컬 자동 설정을 따로 쓰려면 `config.example.js`를 `config.local.js`로 복사하고 publishable key를 넣습니다. `config.local.js`는 `.gitignore`에 들어 있어 GitHub에 올라가지 않습니다.

현재 Supabase 연동은 안정성을 위해 `app_snapshots` 테이블에 전체 앱 상태를 저장/복원하는 방식입니다. 이후 환자/방문/용어 테이블을 개별 동기화로 확장할 수 있습니다.

## Whisper Memos 자동 Import

Whisper Memos의 iCloud transcript 경로는 현재 다음으로 확인되었습니다.

```text
/Users/hansol/Library/Mobile Documents/iCloud~tech~median~Whisper/Documents/Transcripts
```

watcher 설정:

1. `watcher.example.json`을 `watcher.local.json`으로 복사합니다.
2. `supabaseAnonKey`, `email`, `password`를 채웁니다.
3. 테스트:

```bash
node scripts/watch-whisper-transcripts.mjs --dry-run
```

4. 실제 업로드 1회:

```bash
node scripts/watch-whisper-transcripts.mjs --once
```

5. 계속 감시:

```bash
node scripts/watch-whisper-transcripts.mjs
```

앱이 열려 있고 Supabase에 로그인되어 있으면 30초마다 클라우드 `raw_inbox`를 확인해서 Import Inbox로 가져옵니다.
