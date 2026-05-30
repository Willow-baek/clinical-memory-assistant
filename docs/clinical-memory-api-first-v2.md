# Clinical Memory Assistant API-first v2 설계

## 1. 최종 목적

Clinical Memory Assistant의 목적은 병원 EMR을 대체하는 것이 아니다.

이 앱의 최종 목적은 다음 한 문장으로 고정한다.

> 치료사가 치료 자체에 쓰는 에너지는 유지하고, 기록/기억/추적/차트 작성에 쓰는 정신 에너지를 줄이는 개인용 clinical memory assistant.

즉 앱이 해야 할 일은 치료 결정을 대신하는 것이 아니라, 아래 흐름을 빠르게 연결하는 것이다.

- 병원 스케줄 캡쳐
- Apple Watch/Whisper transcript
- 초진 차트 이미지
- 환자/방문 기록
- 재진 브리핑
- 차트 초안

## 2. v2 핵심 판단

v1은 무료/수동 workflow에 너무 맞춰져 실제 사용 마찰이 컸다.

v2는 소액 API 비용을 허용하고, 사용자가 반복 복붙/외부 AI 왕복을 하지 않아도 되는 구조로 간다.

핵심 판단:

- 앱 내부에서 API 기반 이미지/텍스트 분석을 제공한다.
- ChatGPT 웹페이지 iframe 삽입은 하지 않는다.
- ChatGPT 구독은 Codex 개발/일반 상담용으로 유지한다.
- 실제 앱 자동화는 OpenAI/Claude API를 Supabase Edge Function 뒤에 숨겨 호출한다.
- 프론트엔드에는 OpenAI/Claude API key를 절대 넣지 않는다.
- 이미지/오디오는 기본 저장하지 않고, 분석 결과 텍스트와 구조화 데이터만 저장한다.

## 3. 제품 원칙

- 1분 안에 기록 가능해야 한다.
- 치료 중에는 앱이 방해가 되면 안 된다.
- 완전 자동 확정보다 빠른 후보 생성 + 사용자의 확인을 우선한다.
- AI는 판단자가 아니라 정리자/초안 작성자/누락 알림 역할이다.
- 모든 자동 결과는 수정 가능해야 한다.
- 잘못된 자동 매칭은 덮어쓰기보다 `needs_review`로 남긴다.
- 새 기능은 실제 workflow에서 쓰이지 않으면 제거한다.

## 4. 주요 사용자 흐름

### A. 출근 전/업무 시작

목표: 오늘 볼 환자와 확인 포인트를 빠르게 파악한다.

입력:

- 전날 또는 오늘 아침 SmartCRM 스케줄 캡쳐
- 기존 patient/visit 기록

앱 동작:

- 스케줄 이미지에서 오늘 Visit 후보와 다음 영업일 Appointment 후보 추출
- 빨간 취소 블록 제외
- 날짜/시간/이름/duration 추출
- 환자 기존 기록과 연결 후보 표시
- 오늘 환자별 브리핑 제공

출력:

- 오늘 타임라인
- 각 환자 요약
- 오늘 확인할 tracking variables
- HEP/adherence/compensation 주의점

### B. 치료 중/치료 직후

목표: Apple Watch 녹음만으로 차트 초안까지 이어지게 한다.

입력:

- Whisper Memos transcript
- 스케줄/Visit record

앱 동작:

- iCloud transcript watcher가 raw inbox로 업로드
- 시간 기준으로 오늘 Visit 후보와 매칭
- API가 transcript를 clinical sections로 정리
- 사용자가 확인 후 Visit에 연결

출력:

- Subjective
- Objective
- Treatment
- HEP/Homework
- Assessment
- Next check
- Chart draft

### C. 퇴근 전

목표: 오늘 치료 기록을 마감하고, 내일 예약을 준비한다.

입력:

- SmartCRM 최종 스케줄 캡쳐
- 하루 동안 들어온 transcript

앱 동작:

- 오늘 Visit 확정/업데이트
- 내일 Appointment 생성
- 미매칭 transcript를 시간 기준 후보로 제시
- 사용자가 확인/수정/폐기

출력:

- 오늘 Visit 기록 정리
- 내일 Appointment 브리핑 준비
- 차트 복사 가능한 초안

### D. 초진

목표: 초진 정보량을 재진 추적 framework로 바꾼다.

입력:

- 초진 interview transcript
- 의사 초진 차트 이미지

앱 동작:

- chart number/name/date/measurements 추출
- chief complaint/history/precaution 후보 생성
- signal/secondary signal/noise 분류 초안
- tracking variables 제안

출력:

- patient profile
- initial visit summary
- tracking variables
- clinical hypothesis candidates
- progression scaffold

## 5. 주요 기능

### 5.1 Schedule OCR

사용자가 병원 스케줄 이미지를 붙여넣으면 앱이 바로 처리한다.

필수 추출 필드:

- date
- time
- patient_name_text
- duration_minutes
- kind: `visit` 또는 `appointment`
- needs_review

MVP 제외:

- 상태 문구
- ok/여진
- 환자 요청사항
- 패키지 메모
- 모든 텍스트 완전 보존

### 5.2 Transcript to Chart Draft

Whisper transcript를 chart draft로 정리한다.

기본 section:

- subjective
- objective
- treatment
- homework
- assessment
- next_check
- special_notes
- raw_transcript

중요:

- 원본 transcript는 raw inbox에 보존한다.
- AI 정리 결과는 visit draft에 연결한다.
- 확정 전에는 사용자가 수정할 수 있어야 한다.

### 5.3 Initial Chart OCR

손글씨 초진 차트는 완벽 OCR이 아니라 검토 후보로 처리한다.

우선 추출:

- date
- patient_name
- chart_number
- measurements
- chief_complaint
- medical_info
- precautions
- raw_notes
- needs_review

### 5.4 Patient Memory

patient는 장기 기억의 중심이다.

저장:

- chart_number/code
- name
- body region
- flags
- tracking variables
- visit history
- recurring compensations
- HEP adherence pattern
- fear/avoidance or behavior notes

### 5.5 Visit Briefing

환자 방문 전 앱이 보여줄 핵심:

- 마지막 방문일
- 지난 치료
- 지난 HEP
- 추적 변수 변화
- 오늘 확인할 질문
- 주의할 compensation
- 최근 chart draft

## 6. 아키텍처

```text
Browser UI (GitHub Pages or static hosting)
  |
  | user login
  v
Supabase Auth
  |
  | app data
  v
Supabase Postgres
  |
  | secure AI call
  v
Supabase Edge Functions
  |
  | provider adapter
  v
OpenAI / Claude API
```

### Frontend

역할:

- 빠른 입력 UI
- 이미지/텍스트 붙여넣기
- 스케줄/방문/환자 표시
- 사용자 확인/수정/삭제
- 차트 초안 복사

하지 않는 일:

- API key 보관
- AI provider 직접 호출
- 이미지/오디오 장기 저장

### Supabase

역할:

- 로그인
- 데이터 저장
- Edge Function 실행
- API key secret 관리

### Edge Functions

기본 함수:

- `analyze-schedule-image`
- `analyze-transcript`
- `analyze-initial-chart`

각 함수는 다음 형식을 따른다.

```json
{
  "input": {
    "image": "base64 or upload reference",
    "text": "optional raw text",
    "context": {}
  },
  "output": {
    "items": [],
    "sections": {},
    "needs_review": false,
    "warnings": []
  }
}
```

## 7. 데이터 모델

### patients

- id
- owner_id
- chart_number
- name
- age
- sex
- region
- flags
- created_at
- updated_at

### appointments

예정 스케줄.

- id
- owner_id
- patient_id nullable
- patient_name_text
- date
- time
- duration_minutes
- source
- needs_review
- review_reason

### visits

실제 치료/마감 기록.

- id
- owner_id
- patient_id nullable
- appointment_id nullable
- patient_name_text
- date
- time
- duration_minutes
- transcript_raw
- chart_sections jsonb
- chart_draft
- tracking_snapshot jsonb
- needs_review
- review_reason

### raw_inbox

확정 전 대기 공간.

- id
- owner_id
- type: `transcript`, `schedule_image`, `initial_chart_image`, `ai_result`
- raw_text
- parsed_json
- source_file
- recorded_date
- recorded_time
- status: `new`, `suggested`, `linked`, `discarded`
- linked_visit_id nullable
- linked_patient_id nullable

### ai_jobs

비용/오류 추적용.

- id
- owner_id
- job_type
- provider
- model
- input_tokens
- output_tokens
- estimated_cost_usd
- status
- error
- created_at

## 8. AI 사용 정책

### 기본 모델 전략

- 일반 스케줄 OCR: 저렴한 vision-capable mini model
- transcript chart draft: mini model
- 초진 손글씨 chart: mini model 우선, 실패 시 고성능 모델 재시도 버튼

### 비용 통제

- 모든 AI 호출은 버튼 기반으로 시작한다.
- 자동 호출은 충분히 안정화된 후에만 켠다.
- 월 예상 비용을 앱에 표시한다.
- Supabase Edge Function에서 호출 로그를 남긴다.
- provider dashboard에서 월 한도를 설정한다.

### 저장 정책

- 원본 이미지와 오디오는 기본 저장하지 않는다.
- 이미지 분석 후 구조화 텍스트만 저장한다.
- transcript 원문은 저장 가능하지만 visit과 분리된 raw inbox에 둔다.

## 9. v2 화면 구조

### Home

가장 중요한 첫 화면.

- 오늘 3일 스케줄
- 오늘 Visit
- 내일 Appointment
- 미처리 transcript
- 선택 환자 브리핑
- 빠른 AI import 버튼

### Inbox

모든 미확정 항목의 검토 공간.

- schedule image result
- transcript result
- initial chart result
- matching candidates

### Patients

장기 기억.

- patient profile
- visit history
- tracking variables
- recurring notes

### Visits

차트 초안 편집 공간.

- visit detail
- transcript raw
- chart sections
- chart draft
- copy button

### Settings

- Supabase 연결
- AI provider 설정 상태
- 사용량/비용
- 모델 선택

## 10. v2 MVP 범위

1차 MVP:

- Supabase Edge Function 골격
- API key secret 설정
- schedule image -> visits/appointments
- transcript -> chart sections/draft
- AI job cost logging
- 기존 수동 import UI는 fallback으로 유지

2차:

- initial chart image -> patient/measurements 후보
- visit briefing 자동 생성
- better matching candidates

3차:

- clinical reasoning assistant
- trend visualization
- mobile optimized quick review

## 11. 버릴 것 / 줄일 것

줄일 것:

- 외부 AI 프롬프트 복사/붙여넣기 workflow
- 과한 수동 import lane
- 복잡한 OCR fallback UI
- ChatGPT 창 제어 중심 UX

유지할 것:

- Supabase login/sync
- Whisper watcher
- patients/appointments/visits/raw_inbox 개념
- Chrome extension은 보조 도구로 유지
- 사용자 확인 후 확정 원칙

## 12. 성공 기준

이 앱은 다음 조건을 만족하면 성공이다.

- 출근 후 오늘 환자 흐름을 1분 안에 파악할 수 있다.
- 스케줄 캡쳐 1장으로 Visit/Appointment 후보가 만들어진다.
- Apple Watch 녹음 후 transcript가 자동으로 들어온다.
- 버튼 한 번으로 차트 초안이 만들어진다.
- 치료 후 기록 시간이 1~2분 안으로 줄어든다.
- 재진 때 기억해야 할 질적 정보가 날아가지 않는다.
- 사용자가 앱을 억지로 쓰는 느낌이 아니라, 안 쓰면 더 불편하다고 느낀다.
