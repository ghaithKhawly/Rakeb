import {
  DEST_PREFIXES,
  FOLLOWUP_PATTERNS,
  ORIGIN_DEST_PATTERNS,
  ORIGIN_PREFIXES,
} from "./patterns";
import { normalizeArabic } from "./normalizeArabic";

export interface ExtractionResult {
  originText: string | null;
  destText: string | null;
  isFollowUp: boolean;
}

const CURRENT_PLACE_WORDS = new Set([
  "هون",
  "هنا",
  "موقعي",
  "مكاني",
  "عندي",
  "البيت",
  "بيتي",
  "منزلي",
  "نفس المكان",
  "هناك",
  "هنيك",
  "الموقع الحالي",
  "المكان الحالي",
]);

function stripPrefixes(text: string, prefixes: string[]): string {
  let trimmed = text.trim();
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      trimmed = trimmed.slice(prefix.length).trim();
      break;
    }
  }
  return trimmed;
}

function cleanOrigin(text: string): string {
  const cleaned = stripPrefixes(text, ORIGIN_PREFIXES)
    .replace(/^عند\s+/u, "")
    .replace(/^(?:انا|اني)\s+(?:بال|ب|في|عند)?\s*/u, "")
    .replace(/^بال/u, "ال")
    .replace(/^ب(?=ال)/u, "")
    .trim();

  return CURRENT_PLACE_WORDS.has(cleaned) ? "" : cleaned;
}

function cleanDestination(text: string): string {
  const withoutCommand = stripPrefixes(text, DEST_PREFIXES)
    .replace(/^(?:بدي\s+اروح|بدي\s+روح|رح|ودني|خدني|وصلني|رايح|رايحه|متجه|متجهه)\s+/u, "")
    .replace(/^(?:كيف|شو|اي)\s+(?:الطريق|طريق|باص|خط)\s+/u, "")
    .trim();

  return stripPrefixes(withoutCommand, DEST_PREFIXES)
    .replace(/^(?:عال)/u, "")
    .replace(/^(?:علي|الي|نحو)\s*/u, "")
    .replace(/^(?:لل)/u, "ال")
    .replace(/^(?:لـ|ل)(?=ال)/u, "")
    .replace(/^(?:ع)\s+/u, "")
    .trim();
}

function normalizeMaybeCurrentOrigin(text: string): string | null {
  return cleanOrigin(text) || null;
}

function extractCurrentPlace(normalized: string): string | null {
  const match = normalized.match(
    /(?:^|\s)(?:انا|اني)\s+(?:بال|ب|في|عند)\s*(.+?)\s+(?:و)?(?:بدي|بدنا|رح|رايح|رايحه|متجه|متجهه|اريد)/u,
  );

  if (!match?.[1]) {
    return null;
  }

  return cleanOrigin(match[1]) || null;
}

export function extractRawLocations(input: string): ExtractionResult {
  const normalized = normalizeArabic(input);

  const hasExplicitDestination = /\s(?:الي|حتي|لل|لـ|ل|عال|علي|ع\s+|نحو)\s*\S+/u.test(normalized);
  for (const pattern of FOLLOWUP_PATTERNS) {
    if (hasExplicitDestination) {
      break;
    }
    if (pattern.test(normalized)) {
      return { originText: null, destText: null, isFollowUp: true };
    }
  }

  const destinationFirst = normalized.match(
    /(?:بدي\s+اروح|بدي\s+روح|رح|ودني|خدني|وصلني|رايح|رايحه|متجه|متجهه)\s+(?:عال|علي\s+|الي\s+|لل|لـ|ل(?=ال)|ع\s+)?(.+?)\s+من\s+(.+)/u,
  );
  if (destinationFirst?.[1] && destinationFirst[2]) {
    return {
      originText: normalizeMaybeCurrentOrigin(destinationFirst[2]),
      destText: cleanDestination(destinationFirst[1]),
      isFollowUp: false,
    };
  }

  const currentOrigin = extractCurrentPlace(normalized);

  const labeled = normalized.match(
    /(?:الانطلاق|البدايه|نقطه الانطلاق|نقطة الانطلاق)\s*(?:من)?\s+(.+?)\s+(?:و)?(?:الوجهه|الوجهة|النهايه|النهاية|الى|الي|ل)\s+(.+)/u,
  );
  if (labeled?.[1] && labeled[2]) {
    return {
      originText: normalizeMaybeCurrentOrigin(labeled[1]),
      destText: cleanDestination(labeled[2]),
      isFollowUp: false,
    };
  }

  const promptedDestinationThenOrigin = normalized.match(
    /^(?:كيف|شو|اي)\s+(?:الطريق|طريق|باص|خط)\s+(?:الي|عال|علي|لل|لـ|ل(?=ال)|ع\s+)?(.+?)\s+من\s+(.+)/u,
  );
  if (promptedDestinationThenOrigin?.[1] && promptedDestinationThenOrigin[2]) {
    return {
      originText: normalizeMaybeCurrentOrigin(promptedDestinationThenOrigin[2]),
      destText: cleanDestination(promptedDestinationThenOrigin[1]),
      isFollowUp: false,
    };
  }

  for (const pattern of ORIGIN_DEST_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    if (match[1] && match[2]) {
      return {
        originText: normalizeMaybeCurrentOrigin(match[1]),
        destText: cleanDestination(match[2]),
        isFollowUp: false,
      };
    }

    if (match[1] && !match[2]) {
      return {
        originText: currentOrigin,
        destText: cleanDestination(match[1]),
        isFollowUp: false,
      };
    }
  }

  const destinationThenOrigin = normalized.match(
    /^(?:الي|عال|علي|لل|لـ|ل(?=ال)|ع\s+)?(.+?)\s+من\s+(.+)/u,
  );
  if (destinationThenOrigin?.[1] && destinationThenOrigin[2]) {
    return {
      originText: normalizeMaybeCurrentOrigin(destinationThenOrigin[2]),
      destText: cleanDestination(destinationThenOrigin[1]),
      isFollowUp: false,
    };
  }

  const commandDestination = normalized.match(
    /(?:بدي\s+اروح|بدي\s+روح|رح|ودني|خدني|وصلني|رايح|رايحه|متجه|متجهه)\s+(?:عال|علي\s+|الي\s+|لل|لـ|ل(?=ال)|ع\s+)?(.+)/u,
  );
  if (commandDestination?.[1]) {
    return {
      originText: currentOrigin,
      destText: cleanDestination(commandDestination[1]),
      isFollowUp: false,
    };
  }

  const originOnlyPrefix = ORIGIN_PREFIXES.find((prefix) => normalized.startsWith(prefix));
  if (originOnlyPrefix) {
    return {
      originText: normalizeMaybeCurrentOrigin(normalized),
      destText: null,
      isFollowUp: false,
    };
  }

  const currentPlaceOnly = normalized.match(/^(?:انا|اني)\s+(?:بال|ب|في|عند)\s*(.+)$/u);
  if (currentPlaceOnly?.[1]) {
    return {
      originText: normalizeMaybeCurrentOrigin(currentPlaceOnly[1]),
      destText: null,
      isFollowUp: false,
    };
  }

  return {
    originText: currentOrigin,
    destText: cleanDestination(normalized),
    isFollowUp: false,
  };
}
