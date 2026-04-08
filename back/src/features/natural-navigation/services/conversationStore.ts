import type { FastifyInstance } from "fastify";
import type { ClarificationType, NlpConversationRow } from "../types/naturalNavigation";

type StoreConversationInput = {
  traceId: string;
  userId: number | null;
  partialOriginId: string | null;
  partialDestinationId: string | null;
  clarificationType: ClarificationType;
  disambiguationCandidates: string[];
  lastKnownDestinationId: string | null;
};

async function purgeExpired(fastify: FastifyInstance): Promise<void> {
  await fastify.pg.query("DELETE FROM nlp_conversations WHERE expires_at < NOW()", []);
}

export async function getConversation(
  fastify: FastifyInstance,
  conversationId: string,
): Promise<NlpConversationRow | null> {
  await purgeExpired(fastify);

  const res = await fastify.pg.query<NlpConversationRow>(
    `
    SELECT
      conversation_id,
      trace_id,
      user_id,
      partial_origin_id,
      partial_destination_id,
      last_known_destination_id,
      clarification_type,
      COALESCE(disambiguation_candidates, '[]'::jsonb)::jsonb AS disambiguation_candidates,
      expires_at::text
    FROM nlp_conversations
    WHERE conversation_id = $1
      AND expires_at >= NOW()
    LIMIT 1
    `,
    [conversationId],
  );

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    disambiguation_candidates: Array.isArray(row.disambiguation_candidates) ? row.disambiguation_candidates : [],
  };
}

export async function upsertConversation(
  fastify: FastifyInstance,
  input: StoreConversationInput,
  conversationId?: string,
): Promise<string> {
  await purgeExpired(fastify);

  if (conversationId) {
    const updated = await fastify.pg.query<{ conversation_id: string }>(
      `
      UPDATE nlp_conversations
      SET
        trace_id = $2,
        user_id = $3,
        partial_origin_id = $4,
        partial_destination_id = $5,
        clarification_type = $6,
        disambiguation_candidates = $7::jsonb,
        last_known_destination_id = $8,
        expires_at = NOW() + INTERVAL '10 minutes'
      WHERE conversation_id = $1
      RETURNING conversation_id
      `,
      [
        conversationId,
        input.traceId,
        input.userId,
        input.partialOriginId,
        input.partialDestinationId,
        input.clarificationType,
        JSON.stringify(input.disambiguationCandidates),
        input.lastKnownDestinationId,
      ],
    );

    if (updated.rowCount && updated.rows[0]) {
      return updated.rows[0].conversation_id;
    }
  }

  const inserted = await fastify.pg.query<{ conversation_id: string }>(
    `
    INSERT INTO nlp_conversations (
      trace_id,
      user_id,
      partial_origin_id,
      partial_destination_id,
      clarification_type,
      disambiguation_candidates,
      last_known_destination_id
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    RETURNING conversation_id
    `,
    [
      input.traceId,
      input.userId,
      input.partialOriginId,
      input.partialDestinationId,
      input.clarificationType,
      JSON.stringify(input.disambiguationCandidates),
      input.lastKnownDestinationId,
    ],
  );

  return inserted.rows[0].conversation_id;
}

export async function markConversationCompleted(
  fastify: FastifyInstance,
  conversationId: string,
  lastKnownDestinationId: string | null,
): Promise<void> {
  await fastify.pg.query(
    `
    UPDATE nlp_conversations
    SET
      partial_origin_id = NULL,
      partial_destination_id = NULL,
      clarification_type = NULL,
      disambiguation_candidates = '[]'::jsonb,
      last_known_destination_id = COALESCE($2, last_known_destination_id),
      expires_at = NOW() + INTERVAL '10 minutes'
    WHERE conversation_id = $1
    `,
    [conversationId, lastKnownDestinationId],
  );
}

export async function logUnknownLocations(
  fastify: FastifyInstance,
  traceId: string,
  userId: number | null,
  unknownLocations: string[],
): Promise<void> {
  if (unknownLocations.length === 0) {
    return;
  }

  await fastify.pg.query(
    `
    INSERT INTO nlp_unknown_locations (trace_id, user_id, unknown_locations)
    VALUES ($1, $2, $3::jsonb)
    `,
    [traceId, userId, JSON.stringify(unknownLocations)],
  );
}

export async function logParseAttempt(
  fastify: FastifyInstance,
  input: {
    traceId: string;
    userId: number | null;
    requestText: string;
    parsedIntent: unknown;
    fallbackTriggered: boolean;
    latencyMs: number;
    scenarioType: string;
    provider: string | null;
    model: string | null;
  },
): Promise<void> {
  await fastify.pg.query(
    `
    INSERT INTO llm_parse_log (
      trace_id,
      user_id,
      request_text,
      parsed_intent,
      fallback_triggered,
      latency_ms,
      scenario_type,
      nlp_provider,
      nlp_model
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
    `,
    [
      input.traceId,
      input.userId,
      input.requestText,
      JSON.stringify(input.parsedIntent ?? null),
      input.fallbackTriggered,
      input.latencyMs,
      input.scenarioType,
      input.provider,
      input.model,
    ],
  );
}
