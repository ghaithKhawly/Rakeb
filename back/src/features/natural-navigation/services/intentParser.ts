import {
  getLandmarkById,
  getLandmarkCandidates,
  getLandmarkListForPrompt,
} from "../data/damascusLandmarks";
import { parseWithLlm } from "./llmClient";
import { detectLanguage } from "./textProcessing";
import type {
  NlpConversationRow,
  TripIntentParseResult,
} from "../types/naturalNavigation";

function defaultResult(text: string): TripIntentParseResult {
  return {
    origin_id: null,
    destination_id: null,
    ambiguous: false,
    clarification_question: null,
    intent: "trip_planning",
    origin_candidates: [],
    destination_candidates: [],
    unknown_locations: [],
    route_info_query: null,
    detected_language: detectLanguage(text),
  };
}

function extractRouteInfoQuery(text: string): string | null {
  const lower = text.toLowerCase();
  const routePatterns = [
    /(?:line|route|bus)\s*([a-z0-9_-]+)/i,
    /(?:الخط|خط)\s*([\u0600-\u06FF0-9_-]+)/i,
  ];

  for (const pattern of routePatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractCandidateAfter(text: string, markers: string[]): string {
  const lower = text.toLowerCase();
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      const raw = text.slice(idx + marker.length).trim();
      if (raw.length > 1) {
        return raw;
      }
    }
  }
  return "";
}

function extractBetweenMarkers(
  text: string,
  markers: string[],
  stopMarkers: string[],
): string {
  const lower = text.toLowerCase();
  let startIndex = -1;
  let markerLength = 0;

  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0 && (startIndex === -1 || idx < startIndex)) {
      startIndex = idx;
      markerLength = marker.length;
    }
  }

  if (startIndex === -1) {
    return "";
  }

  const valueStart = startIndex + markerLength;
  const after = text.slice(valueStart);
  const afterLower = lower.slice(valueStart);

  let end = after.length;
  for (const stop of stopMarkers) {
    const idx = afterLower.indexOf(stop);
    if (idx >= 0 && idx < end) {
      end = idx;
    }
  }

  return after.slice(0, end).trim();
}

function buildAmbiguityQuestion(language: "ar" | "en" | "mixed", candidates: string[]): string {
  const labels = candidates
    .slice(0, 5)
    .map((id, index) => {
      const landmark = getLandmarkById(id);
      const label = landmark ? (language === "en" ? landmark.nameEn : landmark.nameAr) : id;
      return `${index + 1}. ${label}`;
    })
    .join("\n");

  if (language === "en") {
    return `Which one do you mean?\n${labels}`;
  }

  return `أي خيار تقصد؟\n${labels}`;
}

function deterministicParse(
  text: string,
  mode: "full" | "origin_only" | "destination_only",
): TripIntentParseResult {
  const result = defaultResult(text);
  const routeName = extractRouteInfoQuery(text);
  const lower = text.toLowerCase();

  if (routeName && (lower.includes("line") || lower.includes("route") || lower.includes("الخط") || lower.includes("خط"))) {
    result.intent = "route_info";
    result.route_info_query = { route_name: routeName };
    return result;
  }

  const genericOnly = ["مرحبا", "اهلا", "hello", "hi", "what is up", "كيفك"];
  if (genericOnly.some((g) => lower === g)) {
    result.intent = "general_question";
    return result;
  }

  const hasOriginMarker = lower.includes("from ") || lower.includes(" من ") || lower.startsWith("من ");
  const hasDestinationMarker = lower.includes("to ")
    || lower.includes(" الى ")
    || lower.includes(" إلى ")
    || lower.includes("عال")
    || lower.includes(" على ");

  const originChunk = extractBetweenMarkers(
    ` ${text} `,
    [" from ", " من "],
    [" to ", " الى ", " إلى ", " عال", " على "],
  ) || extractCandidateAfter(text, ["from ", "من "]);

  const destinationChunk = extractBetweenMarkers(
    ` ${text} `,
    [" to ", " الى ", " إلى ", " عال", " على "],
    [" from ", " من "],
  ) || extractCandidateAfter(text, ["to ", "الى ", "إلى ", "عال", "على "]);

  const allCandidates = getLandmarkCandidates(text);
  const originCandidates = originChunk
    ? getLandmarkCandidates(originChunk)
    : (hasOriginMarker ? allCandidates : []);
  const destinationCandidates = destinationChunk
    ? getLandmarkCandidates(destinationChunk)
    : (hasDestinationMarker ? allCandidates : []);

  if (mode !== "destination_only") {
    if (originCandidates.length === 1) {
      result.origin_id = originCandidates[0];
    } else if (originCandidates.length > 1) {
      result.origin_candidates = originCandidates.slice(0, 5);
    }
  }

  if (mode !== "origin_only") {
    if (destinationCandidates.length === 1) {
      result.destination_id = destinationCandidates[0];
    } else if (destinationCandidates.length > 1) {
      result.destination_candidates = destinationCandidates.slice(0, 5);
    }
  }

  if (!result.origin_id && !result.destination_id && mode === "full" && result.intent === "trip_planning") {
    result.unknown_locations = [text];
  }

  const isAmbiguous = result.origin_candidates.length > 1 || result.destination_candidates.length > 1;
  result.ambiguous = isAmbiguous;

  if (isAmbiguous) {
    const candidates = result.origin_candidates.length > 1
      ? result.origin_candidates
      : result.destination_candidates;
    result.clarification_question = buildAmbiguityQuestion(result.detected_language, candidates);
  }

  return result;
}

function buildMissingFieldQuestion(
  language: "ar" | "en" | "mixed",
  kind: "origin" | "destination" | "both",
): string {
  if (language === "en") {
    if (kind === "origin") {
      return "Where are you starting from?";
    }
    if (kind === "destination") {
      return "Where do you want to go?";
    }
    return "Where are you going from and to?";
  }

  if (kind === "origin") {
    return "من وين بدك تروح؟";
  }
  if (kind === "destination") {
    return "لوين بدك تروح؟";
  }
  return "من وين لوين بدك تروح؟";
}

function withClarification(result: TripIntentParseResult): TripIntentParseResult {
  if (result.intent !== "trip_planning" && result.intent !== "unclear") {
    result.clarification_question = null;
    return result;
  }

  if (!result.origin_id && !result.destination_id) {
    result.clarification_question = buildMissingFieldQuestion(result.detected_language, "both");
  } else if (!result.origin_id) {
    result.clarification_question = buildMissingFieldQuestion(result.detected_language, "origin");
  } else if (!result.destination_id) {
    result.clarification_question = buildMissingFieldQuestion(result.detected_language, "destination");
  }

  return result;
}

function mergeWithConversation(
  parsed: TripIntentParseResult,
  conversation: NlpConversationRow,
): TripIntentParseResult {
  return {
    ...parsed,
    origin_id: parsed.origin_id ?? conversation.partial_origin_id,
    destination_id: parsed.destination_id ?? conversation.partial_destination_id,
  };
}

export async function parseTripIntent(
  text: string,
  mode: "full" | "origin_only" | "destination_only",
  conversation?: NlpConversationRow,
): Promise<TripIntentParseResult> {
  const landmarkList = getLandmarkListForPrompt();

  let parsed: TripIntentParseResult;
  try {
    parsed = await parseWithLlm({ text, mode, landmarkList });
  } catch {
    parsed = deterministicParse(text, mode);
  }

  const merged = conversation ? mergeWithConversation(parsed, conversation) : parsed;
  return withClarification(merged);
}
