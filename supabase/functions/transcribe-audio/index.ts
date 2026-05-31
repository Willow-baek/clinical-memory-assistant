const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  try {
    const body = await req.json();
    const audioDataUrl = String(body.audioDataUrl || "");
    const fileName = sanitizeFileName(String(body.fileName || "recording.m4a"));
    const language = String(body.language || "ko");
    const prompt = String(
      body.prompt ||
        "한국어 물리치료 임상 녹음입니다. 환자명, 통증, 운동, HEP, compensation, valgus, ROM, NRS 같은 용어를 가능한 정확히 전사하세요.",
    );

    if (!audioDataUrl.startsWith("data:")) {
      return json({ ok: false, error: "audioDataUrl is required" }, 400);
    }

    const { blob, byteLength } = dataUrlToBlob(audioDataUrl);
    if (!byteLength) return json({ ok: false, error: "audio file is empty" }, 400);
    if (byteLength > MAX_AUDIO_BYTES) {
      return json({ ok: false, error: "audio file is too large" }, 413);
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      return json({ ok: false, error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const form = new FormData();
    form.append("model", Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_MODEL);
    form.append("file", blob, fileName);
    form.append("language", language);
    form.append("prompt", prompt);
    form.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
      },
      body: form,
    });

    const payload = await response.json();
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: payload?.error?.message || "OpenAI transcription failed",
          providerStatus: response.status,
        },
        502,
      );
    }

    return json({
      ok: true,
      provider: "openai",
      model: Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_MODEL,
      text: String(payload?.text || "").trim(),
    });
  } catch (error) {
    return json({ ok: false, error: getErrorMessage(error) }, 500);
  }
});

function dataUrlToBlob(dataUrl: string) {
  const [header, data = ""] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const isBase64 = /;base64/i.test(header);
  const bytes = isBase64 ? decodeBase64(data) : new TextEncoder().encode(decodeURIComponent(data));
  return {
    blob: new Blob([bytes], { type: mime }),
    byteLength: bytes.byteLength,
  };
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^\w.\-가-힣]/g, "_").slice(0, 120) || "recording.m4a";
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
