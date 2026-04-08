import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  getLandmarkById,
  isWithinDamascus,
} from "../data/damascusLandmarks";
import {
  getConversation,
  logParseAttempt,
  logUnknownLocations,
  markConversationCompleted,
  upsertConversation,
} from "../services/conversationStore";
import { parseTripIntent } from "../services/intentParser";
import { getNlpProviderAndModel } from "../services/llmClient";
import { computeNaturalRoute } from "../services/naturalRoutingService";
import { getRouteInfoByNameOrId } from "../services/routeInfoService";
import { templateExplanation } from "../services/templateExplanation";
import {
  containsFromThereReference,
  detectLanguage,
  looksLikeTripRequest,
  sanitizeInput,
} from "../services/textProcessing";
import type {
  ClarificationType,
  NlpConversationRow,
  NaturalActionResponse,
  TripIntentParseResult,
} from "../types/naturalNavigation";

const parseTextNavigationSchema = {
  tags: ["Navigation"],
  summary: "Parse natural text into map-ready points",
  operationId: "parseNaturalNavigationText",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["text"],
    additionalProperties: false,
    properties: {
      text: { type: "string", minLength: 1, maxLength: 2000 },
      traceId: { type: "string" },
      conversationId: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      additionalProperties: true,
      required: ["action", "traceId"],
      properties: {
        action: { type: "string" },
        traceId: { type: "string" },
      },
    },
    401: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
      },
    },
  },
};

type RequestBody = {
  text: string;
  traceId?: string;
  conversationId?: string;
};

type HandleNaturalNavigationRequestInput = {
  text: string;
  traceId?: string;
  conversationId?: string;
  userId: number;
  logger: {
    warn: (obj: unknown, msg?: string) => void;
  };
};

function classifyScenario(parsed: TripIntentParseResult): string {
  if (parsed.intent === "route_info") {
    return "route_info";
  }
  if (parsed.unknown_locations.length > 0) {
    return "unknown_landmark";
  }
  if (parsed.ambiguous) {
    return "ambiguous";
  }
  if (!parsed.origin_id || !parsed.destination_id) {
    return "clarification_needed";
  }
  return "complete";
}

function buildClarificationType(parsed: TripIntentParseResult): ClarificationType {
  if (parsed.ambiguous) {
    return "AWAITING_DISAMBIGUATION";
  }
  if (!parsed.origin_id && !parsed.destination_id) {
    return "AWAITING_BOTH";
  }
  if (!parsed.origin_id) {
    return "AWAITING_ORIGIN";
  }
  return "AWAITING_DESTINATION";
}

function mergeFromThere(
  text: string,
  parsed: TripIntentParseResult,
  conversation: NlpConversationRow,
): TripIntentParseResult {
  if (parsed.origin_id || !conversation.last_known_destination_id) {
    return parsed;
  }

  if (!containsFromThereReference(text)) {
    return parsed;
  }

  return {
    ...parsed,
    origin_id: conversation.last_known_destination_id,
    clarification_question: parsed.detected_language === "ar"
      ? "قصدك من الوجهة السابقة؟"
      : "Do you mean from your previous destination?",
  };
}

function buildNonTripMessage(lang: "ar" | "en" | "mixed"): string {
  return lang === "en"
    ? "I can only help with bus trip planning."
    : "أنا بس بساعد بتخطيط رحلات الباص.";
}

export async function handleNaturalTextParsingRequest(
  fastify: FastifyInstance,
  input: HandleNaturalNavigationRequestInput,
): Promise<NaturalActionResponse> {
  if (process.env.NLP_ENABLED !== "true") {
    return {
      action: "show_map_picker",
      reason: "feature_disabled",
      traceId: input.traceId?.trim() || randomUUID(),
    };
  }

  const traceId = input.traceId?.trim() || randomUUID();
  const clean = sanitizeInput(input.text);
  const lang = detectLanguage(input.text ?? "");

  if (!clean) {
    return {
      action: "show_map_picker",
      reason: "empty_or_invalid_input",
      traceId,
      message: lang === "en"
        ? "Please enter a trip request or pick points on the map."
        : "اكتب طلب رحلة أو حدد النقاط على الخريطة.",
    };
  }

  if (!looksLikeTripRequest(clean)) {
    await logParseAttempt(fastify, {
      traceId,
      userId: input.userId,
      requestText: clean,
      parsedIntent: { intent: "general_question" },
      fallbackTriggered: false,
      latencyMs: 0,
      scenarioType: "not_trip_request",
      ...getNlpProviderAndModel(),
    });

    return {
      action: "not_a_trip_request",
      message: buildNonTripMessage(lang),
      traceId,
    };
  }

  let existingConversation: NlpConversationRow | null = null;
  if (input.conversationId) {
    existingConversation = await getConversation(fastify, input.conversationId);
  }

  const startedAt = Date.now();
  let parsed: TripIntentParseResult;

  try {
    if (existingConversation?.clarification_type === "AWAITING_ORIGIN") {
      parsed = await parseTripIntent(clean, "origin_only", existingConversation);
    } else if (existingConversation?.clarification_type === "AWAITING_DESTINATION") {
      parsed = await parseTripIntent(clean, "destination_only", existingConversation);
    } else {
      parsed = await parseTripIntent(clean, "full", existingConversation ?? undefined);
    }
  } catch (error) {
    await logParseAttempt(fastify, {
      traceId,
      userId: input.userId,
      requestText: clean,
      parsedIntent: null,
      fallbackTriggered: true,
      latencyMs: Date.now() - startedAt,
      scenarioType: "parse_failed",
      ...getNlpProviderAndModel(),
    });

    input.logger.warn({ error }, "Natural parser failed");
    return {
      action: "show_map_picker",
      reason: "parse_failed",
      traceId,
    };
  }

  if (existingConversation) {
    parsed = mergeFromThere(clean, parsed, existingConversation);
  }

  await logParseAttempt(fastify, {
    traceId,
    userId: input.userId,
    requestText: clean,
    parsedIntent: parsed,
    fallbackTriggered: false,
    latencyMs: Date.now() - startedAt,
    scenarioType: classifyScenario(parsed),
    ...getNlpProviderAndModel(),
  });

  if (parsed.intent === "route_info" && parsed.route_info_query) {
    const routeInfo = await getRouteInfoByNameOrId(fastify, parsed.route_info_query.route_name);
    return {
      action: "show_route_info",
      traceId,
      data: routeInfo,
    };
  }

  if (parsed.unknown_locations.length > 0) {
    await logUnknownLocations(fastify, traceId, input.userId, parsed.unknown_locations);
    return {
      action: "show_map_picker",
      reason: "unknown_landmark",
      traceId,
      message: parsed.detected_language === "en"
        ? "I could not find that place. Can you locate it on the map?"
        : "ما لقيت هالمكان. رح تساعدني تحدده عالخريطة؟",
    };
  }

  if (parsed.ambiguous || !parsed.origin_id || !parsed.destination_id) {
    const candidates = parsed.origin_candidates.length > 0
      ? parsed.origin_candidates
      : parsed.destination_candidates;

    const convId = await upsertConversation(
      fastify,
      {
        traceId,
        userId: input.userId,
        partialOriginId: parsed.origin_id,
        partialDestinationId: parsed.destination_id,
        clarificationType: buildClarificationType(parsed),
        disambiguationCandidates: candidates,
        lastKnownDestinationId: existingConversation?.last_known_destination_id ?? null,
      },
      input.conversationId,
    );

    const question = parsed.clarification_question
      ?? (parsed.detected_language === "en"
        ? "Please clarify your origin and destination."
        : "رجاء وضح نقطة الانطلاق والوجهة.");

    return {
      action: "ask_clarification",
      question,
      conversation_id: convId,
      traceId,
    };
  }

  const origin = getLandmarkById(parsed.origin_id);
  const destination = getLandmarkById(parsed.destination_id);

  if (!origin || !destination) {
    return {
      action: "show_map_picker",
      reason: "landmark_not_resolved",
      traceId,
    };
  }

  if (!isWithinDamascus(origin) || !isWithinDamascus(destination)) {
    return {
      action: "show_map_picker",
      reason: "coordinate_invalid",
      traceId,
    };
  }

  const convId = await upsertConversation(
    fastify,
    {
      traceId,
      userId: input.userId,
      partialOriginId: parsed.origin_id,
      partialDestinationId: parsed.destination_id,
      clarificationType: "AWAITING_BOTH",
      disambiguationCandidates: [],
      lastKnownDestinationId: parsed.destination_id,
    },
    input.conversationId,
  );

  return {
    action: "preview_points",
    traceId,
    conversation_id: convId,
    from: {
      lat: origin.lat,
      lng: origin.lng,
      label: origin.nameAr,
      landmark_id: origin.id,
    },
    to: {
      lat: destination.lat,
      lng: destination.lng,
      label: destination.nameAr,
      landmark_id: destination.id,
    },
  };
}

export async function naturalNavigationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/navigation/parse-text",
    {
      preHandler: [fastify.authenticate],
      schema: parseTextNavigationSchema,
    },
    async (request, reply) => {
      const body = request.body as RequestBody;
      const userPayload = request.user as { id?: string | number };
      const userId = Number(userPayload?.id);

      if (!Number.isFinite(userId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const result = await handleNaturalTextParsingRequest(fastify, {
        text: body.text,
        traceId: body.traceId,
        conversationId: body.conversationId,
        userId,
        logger: request.log,
      });

      return reply.send(result);
    },
  );
}
