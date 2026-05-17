export const todayISO = () => new Date().toISOString().slice(0, 10);

export const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export function normalizeTime(value) {
  if (!value) return "";
  const raw = String(value).trim().replace(/[Oo]/g, "0").replace("시", ":").replace(/\s/g, "");
  const match = raw.match(/(\d{1,2})(?:[:=.ㆍ·-]?(\d{2}))?/);
  if (!match) return "";
  const hour = match[1].padStart(2, "0");
  const minute = (match[2] || "00").padStart(2, "0");
  return `${hour}:${minute}`;
}

export function normalizeTreatmentMinutes(value) {
  const number = Number(String(value || "").replace(/\D/g, ""));
  if (!Number.isFinite(number) || number < 10 || number > 180) return "";
  return String(number);
}

export function normalizeKoreanTime(value) {
  if (!value) return "";
  const isPM = value.includes("오후");
  const isAM = value.includes("오전");
  const normalized = String(value).replace(/[Oo]/g, "0");
  const match = normalized.match(/(\d{1,2})[:시=.ㆍ·-]\s?(\d{0,2})/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = (match[2] || "00").padStart(2, "0");
  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function normalizeDateText(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "?") return "";
  const compact = raw.replace(/\D/g, "");
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const match = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
