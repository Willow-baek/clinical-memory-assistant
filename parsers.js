import {
  normalizeDateText,
  normalizeKoreanTime,
  normalizeTime,
  normalizeTreatmentMinutes,
  todayISO,
  uid,
} from "./utils.js";

export function parseScheduleText(text, date, sourceFile = "manual paste") {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const timeMatch = line.match(/(\d{1,2}[:시=.ㆍ·-]\s?\d{0,2})/);
      const time = normalizeTime(timeMatch?.[1]);
      if (!time) return null;

      const visitType = /초진|신규|new/i.test(line) ? "초진" : "재진";
      const cleaned = line
        .replace(timeMatch[0], "")
        .replace(/초진|신규|재진|예약|치료|도수|물리치료|new|follow[- ]?up/gi, "")
        .replace(/[|,/\-]+/g, " ")
        .trim();
      const parts = cleaned.split(/\s+/).filter(Boolean);
      const patientName = parts[0] || "이름 미상";
      const note = parts.slice(1).join(" ");

      return {
        id: uid("sch"),
        date,
        time,
        patientName,
        patientCode: "",
        visitType,
        note,
        sourceFile,
        matchedVisitId: null,
        status: "scheduled",
      };
    })
    .filter(Boolean);
}

export function parseSmartCrmScheduleText(text, date, therapistName = "백한솔", sourceFile = "smart crm paste") {
  const candidates = parseSmartCrmScheduleCandidates(text, date, therapistName, sourceFile);
  return candidates
    .filter((candidate) => !candidate.needsReview)
    .map(scheduleCandidateToItem);
}

export function parseSmartCrmScheduleCandidates(
  text,
  date,
  therapistName = "백한솔",
  sourceFile = "smart crm paste",
  targetRecordType = "appointment",
) {
  const normalizedText = normalizeSmartCrmOcrText(text || "");
  const lines = normalizedText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const structuredCandidates = lines
    .map((line) => parseStructuredScheduleCandidateLine(line, date, therapistName, sourceFile, targetRecordType))
    .filter(Boolean);
  if (structuredCandidates.length) return structuredCandidates;

  const segments = splitSmartCrmAppointmentSegments(lines.join("\n"));
  return segments
    .map((segment) => parseSmartCrmScheduleCandidate(segment, date, therapistName, sourceFile, targetRecordType))
    .filter(Boolean);
}

export function parseStructuredScheduleCandidateLine(line, fallbackDate, therapistName, sourceFile, targetRecordType) {
  const raw = String(line || "").trim();
  if (!raw || /예약\s*취소|예약취소|\[?\s*상태\s*[:：]?\s*취소|취소/.test(raw)) return null;
  const match = raw.match(
    /^\s*(?:(\d{4}\s*(?:[-./]|년)\s*\d{1,2}\s*(?:[-./]|월)\s*\d{1,2}\s*일?)\s+)?((?:오전|오후)?\s*(?:[0O]?\d|1\d|2[0-3])\s*[:시=.ㆍ·-]\s*(?:[0-5O]\d|[0-5O]))\s+(.+?)\s*$/,
  );
  if (!match) return null;

  const explicitDate = normalizeDateText(match[1] || "") || extractScheduleLineDate(raw);
  const time = normalizeKoreanTime(match[2]);
  if (!time) return null;

  const detailText = match[3].trim();
  const treatment = extractSmartCrmTreatment(detailText);
  const patientName = inferSmartCrmPatientName(detailText, therapistName);
  const reviewReasons = [];
  if (!patientName) reviewReasons.push("환자명");
  if (!treatment.minutes) reviewReasons.push("치료시간");

  return {
    id: uid("schedcand"),
    type: "schedule_candidate",
    targetRecordType,
    fileName: "schedule candidate",
    createdAt: new Date().toISOString(),
    recordedDate: explicitDate || fallbackDate,
    recordedTime: time,
    patientHint: patientName,
    durationMinutes: treatment.minutes || "",
    sourceFile,
    status: "new",
    matchStatus: "suggested",
    needsReview: reviewReasons.length > 0,
    reviewReason: reviewReasons.join(", "),
  };
}

export function parseCombinedScheduleImport(text, options) {
  const sections = parseSectionedText(text);
  const visitText = getSectionText(sections, ["VISITS", "VISIT"]);
  const appointmentText = getSectionText(sections, ["APPOINTMENTS", "APPOINTMENT"]);
  const candidates = [
    ...parseSmartCrmScheduleCandidates(
      visitText,
      options.visitDate,
      options.therapist,
      `${options.sourceFile} visits`,
      "visit",
    ).map((candidate) => ({ ...candidate, sourceSection: "VISITS" })),
    ...parseSmartCrmScheduleCandidates(
      appointmentText,
      options.appointmentDate,
      options.therapist,
      `${options.sourceFile} appointments`,
      "appointment",
    ).map((candidate) => ({ ...candidate, sourceSection: "APPOINTMENTS" })),
  ];

  return {
    candidates,
    sections,
    unknownSections: collectUnknownSections(sections, ["VISITS", "VISIT", "APPOINTMENTS", "APPOINTMENT"]),
  };
}

export function parseSectionedText(text) {
  const sections = [];
  let current = {
    name: "RAW",
    lines: [],
  };

  String(text || "")
    .replace(/\r/g, "\n")
    .split(/\n/)
    .forEach((line) => {
      const header = line.trim().match(/^\[([A-Za-z0-9_ /-]+)]$/);
      if (header) {
        if (current.lines.length || current.name !== "RAW") sections.push(current);
        current = {
          name: normalizeSectionKey(header[1]),
          lines: [],
        };
      } else {
        current.lines.push(line);
      }
    });

  if (current.lines.length || current.name !== "RAW") sections.push(current);
  return sections.map((section) => ({
    name: section.name,
    text: section.lines.join("\n").trim(),
  }));
}

export function normalizeSectionKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s/-]+/g, "_");
}

export function getSectionText(sections, names) {
  const wanted = new Set(names.map(normalizeSectionKey));
  return sections
    .filter((section) => wanted.has(section.name))
    .map((section) => section.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function collectUnknownSections(sections, knownNames) {
  const known = new Set(knownNames.map(normalizeSectionKey));
  return sections.filter((section) => section.name !== "RAW" && !known.has(section.name) && section.text);
}

export function parseSmartCrmScheduleCandidate(segment, date, therapistName, sourceFile, targetRecordType = "appointment") {
  const time = normalizeKoreanTime(segment.timeText);
  if (!time) return null;
  if (/예약\s*취소|예약취소|\[?\s*상태\s*[:：]?\s*취소|취소/.test(segment.text)) return null;

  const explicitDate = extractScheduleLineDate(segment.text);
  const patientName = inferSmartCrmPatientName(segment.text, therapistName);
  const treatment = extractSmartCrmTreatment(segment.text);
  const reviewReasons = [];
  if (!patientName) reviewReasons.push("환자명");
  if (!treatment.minutes) reviewReasons.push("치료시간");

  return {
    id: uid("schedcand"),
    type: "schedule_candidate",
    targetRecordType,
    fileName: "schedule candidate",
    createdAt: new Date().toISOString(),
    recordedDate: explicitDate || date,
    recordedTime: time,
    patientHint: patientName,
    durationMinutes: treatment.minutes || "",
    sourceFile,
    status: "new",
    matchStatus: "suggested",
    needsReview: reviewReasons.length > 0,
    reviewReason: reviewReasons.join(", "),
  };
}

export function splitSmartCrmAppointmentSegments(text) {
  const matches = findSmartCrmTimeMatches(text);
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return {
      timeText: match[0],
      text: text.slice(match.index, next?.index || text.length).trim(),
    };
  });
}

export function findSmartCrmTimeMatches(text) {
  return [...String(text || "").matchAll(/(?:오전|오후)?\s*([0O]?\d|1\d|2[0-3])\s*[:시=.ㆍ·-]\s*([0-5O]\d|[0-5O])/g)].filter((match) => {
    const start = match.index || 0;
    const end = start + match[0].length;
    const context = String(text || "").slice(Math.max(0, start - 8), Math.min(String(text || "").length, end + 8));
    return !/\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}/.test(context);
  });
}

export function normalizeSmartCrmOcrText(text) {
  const dateTokens = [];
  const protectDate = (match) => {
    const token = `__DATE_TOKEN_${dateTokens.length}__`;
    dateTokens.push({ token, value: match });
    return token;
  };
  const protectedText = String(text || "").replace(
    /\d{4}\s*(?:[-./]|년)\s*\d{1,2}\s*(?:[-./]|월)\s*\d{1,2}\s*일?/g,
    protectDate,
  );
  const normalized = protectedText
    .replace(/\r/g, "\n")
    .replace(/[＝]/g, "=")
    .replace(/[［【]/g, "[")
    .replace(/[］】]/g, "]")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[：]/g, ":")
    .replace(/[|]+/g, " ")
    .replace(/\t/g, " ")
    .replace(/\b([01]\d|2[0-3])[25]([0-5]\d)\b/g, "$1:$2")
    .replace(/\b([01]\d|2[0-3])([0-5]\d)\b/g, "$1:$2")
    .replace(/\b([1-9])([0-5]\d)\b/g, "0$1:$2")
    .replace(/([0O]?\d|1\d|2[0-3])\s*[:시=.ㆍ·-]\s*([0-5O]\d|[0-5O])/g, (full, hour, minute) => {
      return `${hour.replace(/[Oo]/g, "0")}:${minute.replace(/[Oo]/g, "0").padStart(2, "0")}`;
    });
  return dateTokens.reduce((memo, entry) => memo.replaceAll(entry.token, entry.value), normalized);
}

export function extractScheduleLineDate(text) {
  const raw = String(text || "");
  const isoMatch = raw.match(/\b(\d{4}-\d{1,2}-\d{1,2})\b/);
  if (isoMatch) return normalizeDateText(isoMatch[1]);
  const dottedMatch = raw.match(/\b(\d{4})[.\/년\s-]+(\d{1,2})[.\/월\s-]+(\d{1,2})\b/);
  if (dottedMatch) return normalizeDateText(`${dottedMatch[1]}-${dottedMatch[2]}-${dottedMatch[3]}`);
  return "";
}

export function scheduleCandidateToItem(candidate) {
  return {
    id: uid("appt"),
    recordKind: "appointment",
    date: candidate.recordedDate || todayISO(),
    time: candidate.recordedTime,
    patientName: candidate.patientHint,
    patientNameText: candidate.patientHint,
    patientCode: "",
    chartNumber: "",
    visitType: "재진",
    note: candidate.durationMinutes ? `${candidate.durationMinutes}분` : "",
    durationMinutes: candidate.durationMinutes || "",
    sourceFile: candidate.sourceFile || "schedule candidate",
    matchedVisitId: null,
    status: "scheduled",
    matchStatus: "unlinked",
    needsReview: Boolean(candidate.needsReview),
    reviewReason: candidate.reviewReason || "",
  };
}

export function inferSmartCrmPatientName(segment, therapistName) {
  const stopWords = new Set([
    "도수",
    "운동",
    "치료",
    "도수치료",
    "재진",
    "초진",
    "신규",
    "예약",
    "정상예약",
    "방문",
    "예약취소",
    "상태",
    "완료",
    "진료",
    "진료중",
    "진료완료",
    "여진",
    "남",
    "녀",
    "전체",
    "조회",
    "새로고침",
    "기본크기",
    "월별예약리스트",
    "일일현황리스트",
  ]);

  const directPatterns = [
    /\]\s*([가-힣]{2,4})\s*(?:님|닝)?/,
    /백한[솔술출][^\]가-힣]{0,8}\]?\s*([가-힣]{2,4})\s*(?:님|닝)?/,
    /도수[^\]가-힣]{0,8}\]?\s*([가-힣]{2,4})\s*(?:님|닝)?/,
  ];
  for (const pattern of directPatterns) {
    const hit = String(segment || "").match(pattern);
    const candidate = hit?.[1]?.replace(/[님닝]+$/, "");
    if (candidate && !stopWords.has(candidate) && /^[가-힣]{2,4}$/.test(candidate)) return candidate;
  }

  const cleaned = String(segment || "")
    .replace(/(?:오전|오후)?\s*([0O]?\d|1\d|2[0-3])\s*[:시=.ㆍ·-]\s*([0-5O]\d|[0-5O])/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(therapistName || "", " ")
    .replace(/도수치료\d*|운동\d*|TRM|MPT|CFO|F\/U|ok|OK|패키지|연락|변경|상담|재상담/gi, " ")
    .replace(/[0-9]+(?:회|분|세|년|월|일)?/g, " ")
    .replace(/[()[\]{}.,/\\|:;~+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ").map((part) => part.replace(/[님닝]+$/, "")).filter(Boolean);
  return parts.find((part) => {
    if (stopWords.has(part)) return false;
    if (part.length < 2 || part.length > 8) return false;
    if (!/[가-힣]/.test(part)) return false;
    if (!/^[가-힣A-Za-z]+$/.test(part)) return false;
    if (/도수|치료|운동|예약|방문|여진|상담/.test(part)) return false;
    return true;
  }) || "";
}

export function extractSmartCrmTreatment(segment) {
  const text = normalizeSmartCrmOcrText(segment || "")
    .replace(/도[추주]/g, "도수")
    .replace(/[E므][0-9]{1,3}/g, "")
    .replace(/\s+/g, " ");
  const bracketTexts = [...text.matchAll(/\[([^\]]+)]/g)].map((match) => match[1]).reverse();
  const withoutTime = text.replace(/(?:오전|오후)?\s*([0O]?\d|1\d|2[0-3])\s*[:시=.ㆍ·-]\s*([0-5O]\d|[0-5O])/g, " ");
  const candidates = [...bracketTexts, text, withoutTime];
  const patterns = [
    { pattern: /도수\s*치료\s*(\d{2,3})\s*분?/, prefix: "도수치료" },
    { pattern: /도수\s*(\d{2,3})\s*분/, prefix: "도수" },
    { pattern: /도수\s*(\d{2,3})\b/, prefix: "도수치료" },
    { pattern: /운동\s*치료\s*(\d{2,3})\s*분?/, prefix: "운동치료" },
    { pattern: /운동\s*(\d{2,3})\s*(?:패키지|치료|분)/, prefix: "운동치료" },
    { pattern: /(?:^|\s)(\d{2,3})\s*분?(?:\s|$)/, prefix: "" },
  ];

  for (const candidate of candidates) {
    for (const rule of patterns) {
      const hit = candidate.match(rule.pattern);
      const minutes = hit ? normalizeTreatmentMinutes(hit[1]) : "";
      if (minutes) {
        return {
          minutes,
          label: rule.prefix ? `${rule.prefix}${minutes}` : `${minutes}분`,
        };
      }
    }
  }
  return { minutes: "", label: "" };
}
