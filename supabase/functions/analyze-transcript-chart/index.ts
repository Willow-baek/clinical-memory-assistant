const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChartResult = {
  doctor_note: string;
  patient_words: string;
  pt_assessment: {
    red_flag: string;
    specificity: string;
    pain_type: string;
    h1: string;
    h2: string;
    signal: string;
    context_variables: string[];
  };
  plan: {
    goal: string;
    frequency: string;
    today_treatment: string;
    hep: string;
  };
  next: {
    questions: string[];
    context_variables: string[];
    noise: string[];
  };
  trend_judgment: {
    direction: string;
    reason: string;
  };
  signal_tracking_rows: Array<{ name: string; value: string }>;
  pivot_suggestion: {
    needed: boolean;
    new_pain_type: string;
    reason: string;
  };
  subjective: string;
  objective: string;
  treatment: string;
  homework: string;
  assessment: string;
  next_check: string;
  special_notes: string;
  chart_draft: string;
  signals: string[];
  tracking_variables: Array<{ name: string; value: string }>;
  warnings: string[];
};

const DEFAULT_MODEL = "gpt-4.1-mini";

const chartSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    doctor_note: { type: "string" },
    patient_words: { type: "string" },
    pt_assessment: {
      type: "object",
      additionalProperties: false,
      properties: {
        red_flag: { type: "string" },
        specificity: { type: "string" },
        pain_type: { type: "string" },
        h1: { type: "string" },
        h2: { type: "string" },
        signal: { type: "string" },
        context_variables: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["red_flag", "specificity", "pain_type", "h1", "h2", "signal", "context_variables"],
    },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        goal: { type: "string" },
        frequency: { type: "string" },
        today_treatment: { type: "string" },
        hep: { type: "string" },
      },
      required: ["goal", "frequency", "today_treatment", "hep"],
    },
    next: {
      type: "object",
      additionalProperties: false,
      properties: {
        questions: {
          type: "array",
          items: { type: "string" },
        },
        context_variables: {
          type: "array",
          items: { type: "string" },
        },
        noise: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["questions", "context_variables", "noise"],
    },
    trend_judgment: {
      type: "object",
      additionalProperties: false,
      properties: {
        direction: { type: "string" },
        reason: { type: "string" },
      },
      required: ["direction", "reason"],
    },
    signal_tracking_rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
        required: ["name", "value"],
      },
    },
    pivot_suggestion: {
      type: "object",
      additionalProperties: false,
      properties: {
        needed: { type: "boolean" },
        new_pain_type: { type: "string" },
        reason: { type: "string" },
      },
      required: ["needed", "new_pain_type", "reason"],
    },
    subjective: { type: "string" },
    objective: { type: "string" },
    treatment: { type: "string" },
    homework: { type: "string" },
    assessment: { type: "string" },
    next_check: { type: "string" },
    special_notes: { type: "string" },
    chart_draft: { type: "string" },
    signals: {
      type: "array",
      items: { type: "string" },
    },
    tracking_variables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
        required: ["name", "value"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "doctor_note",
    "patient_words",
    "pt_assessment",
    "plan",
    "next",
    "trend_judgment",
    "signal_tracking_rows",
    "pivot_suggestion",
    "subjective",
    "objective",
    "treatment",
    "homework",
    "assessment",
    "next_check",
    "special_notes",
    "chart_draft",
    "signals",
    "tracking_variables",
    "warnings",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  try {
    const body = await req.json();
    const transcript = String(body.transcript || "").trim();
    const patientName = String(body.patientName || "환자 확인");
    const visitDate = String(body.visitDate || "");
    const visitTime = String(body.visitTime || "");
    const durationMinutes = String(body.durationMinutes || "");
    const chartStyle = String(body.chartStyle || "SOAP-lite");

    if (!transcript) {
      return json({ ok: false, error: "transcript is required" }, 400);
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      return json({ ok: false, error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const model = Deno.env.get("OPENAI_CHART_MODEL") || DEFAULT_MODEL;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt({
                  transcript,
                  patientName,
                  visitDate,
                  visitTime,
                  durationMinutes,
                  chartStyle,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "clinical_memory_chart_draft",
            schema: chartSchema,
            strict: true,
          },
        },
      }),
    });

    const openAiPayload = await response.json();
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: openAiPayload?.error?.message || "OpenAI request failed",
          providerStatus: response.status,
        },
        502,
      );
    }

    const rawText = extractResponseText(openAiPayload);
    const parsed = parseChartResult(rawText);

    return json({
      ok: true,
      provider: "openai",
      model,
      ...parsed,
    });
  } catch (error) {
    return json({ ok: false, error: getErrorMessage(error) }, 500);
  }
});

function buildPrompt({
  transcript,
  patientName,
  visitDate,
  visitTime,
  durationMinutes,
  chartStyle,
}: {
  transcript: string;
  patientName: string;
  visitDate: string;
  visitTime: string;
  durationMinutes: string;
  chartStyle: string;
}) {
  return `당신은 물리치료사의 개인 clinical memory assistant입니다.
치료 결정을 대신하지 말고, 치료사가 말한 transcript를 차트 초안과 추적 변수로 정리하세요.
없는 내용은 만들지 말고 "?"로 남기세요. 확정적 진단처럼 쓰지 마세요.
핵심 철학: 매 세션은 하나의 commit입니다. 히스토리를 덮어쓰지 않고, 다음 세션에서 확인할 signal과 버릴 noise를 구분합니다.

방문 정보:
- 환자명: ${patientName || "?"}
- 날짜/시간: ${visitDate || "?"} ${visitTime || "?"}
- 치료 시간: ${durationMinutes || "?"}분
- 차트 스타일: ${chartStyle || "SOAP-lite"}

정리 기준:
- doctor_note: 의사 note/처방/측정값이 transcript에 있으면 정리. 없으면 "".
- patient_words: 환자가 직접 한 말. 의료용어로 번역하지 말고 가능한 원문 표현 유지.
- pt_assessment.red_flag: Y/N/needs review 중 하나.
- pt_assessment.specificity: Specific / Non-specific / mixed / needs review 중 하나.
- pt_assessment.pain_type: Nociceptive / Neuropathic / Nociplastic / Inflammatory / unclear 중 하나.
- pt_assessment.h1, h2: 후보 가설. 확신하지 말고 candidate로 표현.
- pt_assessment.signal: 현재 치료 방향과 직접 관련된 핵심 signal.
- pt_assessment.context_variables: 수면, 피로, HEP adherence, fear avoidance, load, work posture 같은 맥락변수.
- signal_tracking_rows: pain type에 맞춰 다음 재진에 추적할 행.
  - Nociceptive: ROM, 동작 특정 NRS
  - Neuropathic: 저림 범위, Functional test
  - Nociplastic: 수면, 피로, NRS 변동폭
  - Inflammatory: 아침 강직 시간
  - 공통 추가: HEP, 맥락변수, 판단
- trend_judgment.direction: ↑ / → / ↓ / ? 중 하나. 좋아짐, 유지, 악화, 불확실.
- plan.goal: signal 기반 목표.
- plan.frequency: 치료 텀. transcript에 없으면 "".
- plan.today_treatment: 오늘 한 것.
- plan.hep: HEP/숙제.
- next.questions: 다음에 물어볼 것.
- next.context_variables: 다음에 확인할 맥락변수.
- next.noise: 지금 치료 방향을 바꾸지 않는 정보, 버릴 것.
- pivot_suggestion: pain type을 바꿔야 할 만한 근거가 transcript에 명확하면 needed true. 아니면 false.
- subjective: 환자가 말한 증상, 변화, 통증 위치, 악화/완화 요인
- objective: 관찰된 움직임, 테스트, ROM, strength, compensation, movement quality
- treatment: 시행한 치료, 운동, manual therapy, cueing
- homework: HEP/숙제, frequency, 주의사항
- assessment: 오늘의 임상적 해석, signal, secondary signal, 변화 추세
- next_check: 다음 방문 때 확인할 추적 변수, 질문, 관찰 포인트
- special_notes: 환자 반응, compliance, 특이사항
- signals: 임상적으로 반복 추적할 핵심 signal 키워드
- tracking_variables: 재진 때 확인할 변수와 현재 값
- chart_draft: 병원 차트에 붙여넣기 쉬운 짧은 초안. 한국어와 임상 영어 용어 혼용 가능.

원본 transcript:
${transcript}`;
}

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseChartResult(rawText: string): ChartResult {
  try {
    const parsed = JSON.parse(rawText || "{}");
    return {
      doctor_note: stringValue(parsed.doctor_note),
      patient_words: stringValue(parsed.patient_words),
      pt_assessment: normalizePTAssessment(parsed.pt_assessment),
      plan: normalizePlan(parsed.plan),
      next: normalizeNext(parsed.next),
      trend_judgment: normalizeTrendJudgment(parsed.trend_judgment),
      signal_tracking_rows: normalizeTracking(parsed.signal_tracking_rows),
      pivot_suggestion: normalizePivotSuggestion(parsed.pivot_suggestion),
      subjective: stringValue(parsed.subjective),
      objective: stringValue(parsed.objective),
      treatment: stringValue(parsed.treatment),
      homework: stringValue(parsed.homework),
      assessment: stringValue(parsed.assessment),
      next_check: stringValue(parsed.next_check),
      special_notes: stringValue(parsed.special_notes),
      chart_draft: stringValue(parsed.chart_draft),
      signals: normalizeStringArray(parsed.signals),
      tracking_variables: normalizeTracking(parsed.tracking_variables),
      warnings: normalizeStringArray(parsed.warnings),
    };
  } catch {
    return {
      doctor_note: "",
      patient_words: "",
      pt_assessment: normalizePTAssessment({}),
      plan: normalizePlan({}),
      next: normalizeNext({}),
      trend_judgment: normalizeTrendJudgment({}),
      signal_tracking_rows: [],
      pivot_suggestion: normalizePivotSuggestion({}),
      subjective: "?",
      objective: "?",
      treatment: "?",
      homework: "?",
      assessment: "?",
      next_check: "?",
      special_notes: "JSON parse failed",
      chart_draft: rawText || "?",
      signals: [],
      tracking_variables: [],
      warnings: ["Could not parse model JSON"],
    };
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

function normalizePTAssessment(value: unknown) {
  const item = isObject(value) ? value : {};
  return {
    red_flag: stringValue(item.red_flag),
    specificity: stringValue(item.specificity),
    pain_type: stringValue(item.pain_type),
    h1: stringValue(item.h1),
    h2: stringValue(item.h2),
    signal: stringValue(item.signal),
    context_variables: normalizeStringArray(item.context_variables),
  };
}

function normalizePlan(value: unknown) {
  const item = isObject(value) ? value : {};
  return {
    goal: stringValue(item.goal),
    frequency: stringValue(item.frequency),
    today_treatment: stringValue(item.today_treatment),
    hep: stringValue(item.hep),
  };
}

function normalizeNext(value: unknown) {
  const item = isObject(value) ? value : {};
  return {
    questions: normalizeStringArray(item.questions),
    context_variables: normalizeStringArray(item.context_variables),
    noise: normalizeStringArray(item.noise),
  };
}

function normalizeTrendJudgment(value: unknown) {
  const item = isObject(value) ? value : {};
  return {
    direction: stringValue(item.direction),
    reason: stringValue(item.reason),
  };
}

function normalizePivotSuggestion(value: unknown) {
  const item = isObject(value) ? value : {};
  return {
    needed: item.needed === true,
    new_pain_type: stringValue(item.new_pain_type),
    reason: stringValue(item.reason),
  };
}

function normalizeTracking(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = stringValue((item as { name?: unknown }).name);
      const trackingValue = stringValue((item as { value?: unknown }).value);
      return name ? { name, value: trackingValue || "mentioned" } : null;
    })
    .filter(Boolean);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
