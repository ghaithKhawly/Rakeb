import type { SupportedLanguage } from "../types/naturalNavigation";

const MAX_TEXT_LENGTH = 400;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+all\s+previous\s+instructions/i,
  /system\s*prompt/i,
  /return\s+origin_id\s*:/i,
  /<script/i,
  /javascript:/i,
  /```/i,
  /drop\s+table/i,
  /union\s+select/i,
];

const TRIP_KEYWORDS = [
  "روح",
  "بروح",
  "بدي",
  "لوين",
  "من وين",
  "من",
  "إلى",
  "الى",
  "كيف",
  "طريق",
  "باص",
  "حافلة",
  "bus",
  "from",
  "to",
  "take me",
  "route",
  "go to",
  "go from",
  "line",
  "خط",
];

const NON_TRIP_GREETINGS = ["مرحبا", "اهلا", "hello", "hi", "weather", "طقس"];

export function detectLanguage(input: string): SupportedLanguage {
  const hasArabic = /[\u0600-\u06FF]/.test(input);
  const hasLatin = /[A-Za-z]/.test(input);
  if (hasArabic && hasLatin) {
    return "mixed";
  }
  if (hasLatin) {
    return "en";
  }
  return "ar";
}

export function sanitizeInput(raw: string): string {
  const trimmed = (raw ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "";
  }

  const cut = trimmed.slice(0, MAX_TEXT_LENGTH).trim();
  return cut.length >= 5 ? cut : "";
}

export function looksLikeTripRequest(input: string): boolean {
  const lower = input.toLowerCase();
  if (NON_TRIP_GREETINGS.some((kw) => lower.includes(kw))) {
    return false;
  }
  return TRIP_KEYWORDS.some((kw) => lower.includes(kw));
}

export function containsFromThereReference(input: string): boolean {
  const lower = input.toLowerCase();
  return lower.includes("from there") || lower.includes("من هناك") || lower.includes("هنيك");
}
