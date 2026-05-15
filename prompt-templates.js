window.CMA_PROMPT_TEMPLATES = {
  scheduleCombined: {
    id: "scheduleCombined",
    title: "Visit / Appointment schedule OCR prompt",
    description: "전체 스케줄 캡쳐에서 왼쪽 Visit, 오른쪽 Appointment를 한 번에 정리합니다.",
    expectedOutputFormat: `[VISITS]
09:00 김시완 40
09:50 안규빈 60

[APPOINTMENTS]
10:30 조선희 60
11:30 김태현 60`,
    sectionHeaders: ["VISITS", "APPOINTMENTS"],
    promptText: `아래 병원 스케줄 캡쳐 이미지 또는 OCR 텍스트를 앱에 붙여넣기 쉬운 형식으로 정리해 주세요.

전제:
- 왼쪽 컬럼 = 오늘 실제 치료/마감 기록인 Visit
- 오른쪽 컬럼 = 내일 예정 예약인 Appointment

필요한 정보:
- 시간
- 환자 이름
- 치료 시간 숫자

무시할 정보:
- 상태
- 취소
- ok/여진
- 메모
- 환자 요청사항
- 기타 부가 텍스트

출력 형식:
[VISITS]
09:00 김시완 40
09:50 안규빈 60
11:00 임은주 60

[APPOINTMENTS]
10:30 조선희 60
11:30 김태현 60
14:00 배수영 60

규칙:
- 반드시 [VISITS]와 [APPOINTMENTS] section header를 사용하세요.
- 한 예약/방문은 한 줄로 출력하세요.
- 시간은 HH:MM 형식으로 출력하세요.
- 환자 이름에서 "님"은 제거하세요.
- 치료 시간은 [도수치료60], [도수60분], [운동40패키지], [운동치료40] 같은 표현에서 숫자만 출력하세요.
- 취소된 항목은 출력하지 마세요.
- 불확실한 값은 ? 로 표시하세요.
- 설명, 표, markdown 없이 section과 결과 줄만 출력하세요.`,
  },

  transcriptCleanup: {
    id: "transcriptCleanup",
    title: "Whisper transcript cleanup / chart categorization prompt",
    description: "Whisper raw transcript를 차트 필드에 붙이기 쉬운 section 구조로 정리합니다.",
    expectedOutputFormat: `[SUBJECTIVE]
...

[OBJECTIVE]
...

[TREATMENT]
...

[HOMEWORK]
...

[ASSESSMENT]
...

[NEXT_CHECK]
...

[SPECIAL_NOTES]
...`,
    sectionHeaders: [
      "SUBJECTIVE",
      "OBJECTIVE",
      "TREATMENT",
      "HOMEWORK",
      "ASSESSMENT",
      "NEXT_CHECK",
      "SPECIAL_NOTES",
    ],
    promptText: `아래 Whisper Note 또는 Apple Watch 녹음 transcript를 물리치료 차트 초안에 붙여넣기 쉬운 구조로 정리해 주세요.

목표:
- 앱이 section header 기준으로 파싱할 수 있게 정리
- 원문에 없는 내용은 만들지 않기
- 불확실한 내용은 ? 로 표시
- 치료 결정을 대신하지 않고, 기록 정리와 분류만 수행

출력 형식:
[SUBJECTIVE]
환자가 말한 증상, 변화, 통증 위치, 악화/완화 요인

[OBJECTIVE]
관찰된 움직임, 테스트, ROM, strength, compensation, movement quality

[TREATMENT]
오늘 시행한 치료, 운동, manual therapy, cueing

[HOMEWORK]
새로 준 숙제, 수정한 숙제, frequency, 주의사항

[ASSESSMENT]
오늘의 임상적 해석 후보, signal, secondary signal, noise, 변화 추세

[NEXT_CHECK]
다음 방문 때 확인할 추적 변수, 질문, 관찰 포인트

[SPECIAL_NOTES]
특이사항, 환자 반응, compliance, 기타 메모

규칙:
- 반드시 위 section header를 그대로 사용하세요.
- 각 section은 간결한 bullet 또는 짧은 문장으로 정리하세요.
- 확실하지 않은 값은 ? 로 표시하세요.
- 설명 문장이나 markdown 제목 없이 section 형식만 출력하세요.`,
  },

  doctorInitialChart: {
    id: "doctorInitialChart",
    title: "Doctor initial chart OCR / handwritten chart prompt",
    description: "의사 초진 손글씨 차트에서 식별자, 측정값, 주의사항을 검토 가능한 구조로 정리합니다.",
    expectedOutputFormat: `[INITIAL_CHART]
date:
patient_name:
chart_number:

[MEASUREMENTS]
항목명: 값

[CHIEF_COMPLAINT]
...

[MEDICAL_INFO]
...

[PRECAUTIONS]
...

[RAW_NOTES]
...

[NEEDS_REVIEW]
...`,
    sectionHeaders: [
      "INITIAL_CHART",
      "MEASUREMENTS",
      "CHIEF_COMPLAINT",
      "MEDICAL_INFO",
      "PRECAUTIONS",
      "RAW_NOTES",
      "NEEDS_REVIEW",
    ],
    promptText: `아래 의사 초진 차트 이미지 또는 OCR 텍스트를 물리치료 초진 정리용으로 구조화해 주세요.

전제:
- 손글씨라서 완벽한 OCR은 어렵습니다.
- 차트 양식은 반복되므로 위치와 패턴을 참고하세요.
- 초진날짜, 환자이름, chart_number, 숫자 측정값은 최대한 식별하세요.
- 주호소나 자유 메모는 불확실하면 ? 로 표시하세요.

출력 형식:
[INITIAL_CHART]
date:
patient_name:
chart_number:

[MEASUREMENTS]
항목명: 값
항목명: 값

[CHIEF_COMPLAINT]
인식된 주호소. 불확실하면 ? 표시.

[MEDICAL_INFO]
진단명, 영상검사, 의학적 주의사항, 수술력 등 인식 가능한 정보.

[PRECAUTIONS]
red flag 또는 주의사항이 보이면 정리. 없거나 불확실하면 blank 또는 ?.

[RAW_NOTES]
잘 모르겠지만 보이는 메모를 가능한 범위에서 그대로 정리.

[NEEDS_REVIEW]
사용자가 직접 확인해야 하는 항목.

규칙:
- chart_number가 보이면 반드시 적어주세요.
- 숫자 측정값은 [MEASUREMENTS]에 "항목명: 값" 형태로 적어주세요.
- 확실하지 않은 손글씨는 확정하지 말고 ? 또는 NEEDS_REVIEW에 넣어주세요.
- 설명 문장이나 markdown 없이 section 형식만 출력하세요.`,
  },
};

window.promptTemplates = window.CMA_PROMPT_TEMPLATES;
