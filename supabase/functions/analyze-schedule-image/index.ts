const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScheduleEntry = {
  date: string;
  time: string;
  patient_name: string;
  duration_minutes: string;
};

type ScheduleResult = {
  visits: ScheduleEntry[];
  appointments: ScheduleEntry[];
  warnings: string[];
};

const DEFAULT_MODEL = "gpt-4.1-mini";

const scheduleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    visits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          time: { type: "string" },
          patient_name: { type: "string" },
          duration_minutes: { type: "string" },
        },
        required: ["date", "time", "patient_name", "duration_minutes"],
      },
    },
    appointments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          time: { type: "string" },
          patient_name: { type: "string" },
          duration_minutes: { type: "string" },
        },
        required: ["date", "time", "patient_name", "duration_minutes"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["visits", "appointments", "warnings"],
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
    const imageDataUrl = String(body.imageDataUrl || "");
    const visitDate = String(body.visitDate || "");
    const appointmentDate = String(body.appointmentDate || "");
    const therapist = String(body.therapist || "백한솔");

    if (!imageDataUrl.startsWith("data:image/")) {
      return json({ ok: false, error: "imageDataUrl must be a data:image URL" }, 400);
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      return json({ ok: false, error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const model = Deno.env.get("OPENAI_SCHEDULE_MODEL") || DEFAULT_MODEL;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildPrompt({ visitDate, appointmentDate, therapist }) },
              { type: "input_image", image_url: imageDataUrl },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "clinical_memory_schedule_import",
            schema: scheduleSchema,
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
    const parsed = parseScheduleResult(rawText);
    const text = formatScheduleText(parsed);

    return json({
      ok: true,
      provider: "openai",
      model,
      text,
      visits: parsed.visits,
      appointments: parsed.appointments,
      warnings: parsed.warnings,
    });
  } catch (error) {
    return json({ ok: false, error: getErrorMessage(error) }, 500);
  }
});

function buildPrompt({
  visitDate,
  appointmentDate,
  therapist,
}: {
  visitDate: string;
  appointmentDate: string;
  therapist: string;
}) {
  return `아래 병원 주간 예약표 이미지를 분석해서 Clinical Memory Assistant import용 JSON으로 정리하세요.

핵심 workflow:
- Visit = 오늘 날짜의 실제 업무/마감 대상입니다.
- Appointment = 다음 영업일 예정 예약입니다.
- 앱에서 지정한 Visit 날짜: ${visitDate || "?"}
- 앱에서 지정한 Appointment 날짜: ${appointmentDate || "?"}
- 치료사/담당자 기준 이름: ${therapist || "?"}

분석 규칙:
- 이미지에서 오늘 날짜 컬럼과 다음 영업일 컬럼만 사용하세요.
- 휴무일이나 빈 날짜 컬럼은 건너뛰세요.
- 빨간색 블록은 취소 환자이므로 반드시 제외하세요.
- 초록색/파란색은 날짜 기준으로 visits 또는 appointments에 넣으세요.
- 상태, ok/여진, 메모, 환자 요청사항, 패키지 정보는 저장하지 마세요.

추출 필드:
- date: YYYY-MM-DD 형식. 불확실하면 "?"
- time: HH:MM 형식. 불확실하면 "?"
- patient_name: 환자 이름만. "님"은 제거. 불확실하면 "?"
- duration_minutes: 치료 시간 숫자만 문자열로. 불확실하면 "?"

치료 시간 예:
- [도수치료60] -> "60"
- [도수60분] -> "60"
- [운동40패키지] -> "40"
- [운동치료40] -> "40"
- [sb14(도수60분)] -> "60"

주의:
- 원본 이미지나 개인정보를 저장하지 마세요.
- 확실하지 않은 값은 추측하지 말고 "?"로 표시하세요.
- 출력은 반드시 제공된 JSON schema에 맞추세요.`;
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

function parseScheduleResult(rawText: string): ScheduleResult {
  try {
    const parsed = JSON.parse(rawText || "{}");
    return {
      visits: normalizeEntries(parsed.visits),
      appointments: normalizeEntries(parsed.appointments),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    };
  } catch {
    return {
      visits: [],
      appointments: [],
      warnings: rawText ? [`Could not parse model JSON: ${rawText.slice(0, 120)}`] : ["Empty model response"],
    };
  }
}

function normalizeEntries(value: unknown): ScheduleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
    return {
      date: cleanField(row.date),
      time: cleanField(row.time),
      patient_name: cleanName(row.patient_name),
      duration_minutes: cleanField(row.duration_minutes),
    };
  });
}

function formatScheduleText(result: ScheduleResult) {
  return [
    "[VISITS]",
    ...result.visits.map(formatEntry),
    "",
    "[APPOINTMENTS]",
    ...result.appointments.map(formatEntry),
  ].join("\n").trim();
}

function formatEntry(entry: ScheduleEntry) {
  return [entry.date || "?", entry.time || "?", entry.patient_name || "?", entry.duration_minutes || "?"].join(" ");
}

function cleanField(value: unknown) {
  return String(value ?? "").trim() || "?";
}

function cleanName(value: unknown) {
  return cleanField(value).replace(/\s*님$/, "");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
