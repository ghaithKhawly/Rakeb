import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { NavigationRouteRequestBody, RoutingPreferenceWeights, EffectiveRoutingConfig } from "../../../../types/navigation";
import type { SetRoutingPreferencesBody } from "../../../../types/bus";
import {
  normalizeWeights,
  deriveDynamicMaxWalkingDistanceM,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_ROUTING_WEIGHTS,
  mapRouteAvailabilityRow,
} from "../utils/busUtils";

type UserRoutingPreferenceRow = {
  speed_weight: number | null;
  crowding_weight: number | null;
  price_weight: number | null;
  transfer_weight: number | null;
  walking_weight: number | null;
  max_walking_distance_m: number | null;
  max_total_walking_distance_m: number | null;
  max_walking_neighbors: number | null;
  max_bus_transfers: number | null;
  walking_speed_mps: number | null;
  walk_linear_coeff: number | null;
  walk_exp_coeff: number | null;
  walk_exp_scale_m: number | null;
  transfer_exp_coeff: number | null;
  transfer_exp_rate: number | null;
};

type QueryableClient = {
  query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

export async function getEffectiveRoutingConfig(
  client: Awaited<ReturnType<FastifyInstance["pg"]["connect"]>>,
  userId: number,
  body: NavigationRouteRequestBody,
): Promise<EffectiveRoutingConfig> {
  const prefRes = await client.query(
    `
    SELECT
      speed_weight,
      crowding_weight,
      price_weight,
      transfer_weight,
      walking_weight,
      max_walking_distance_m,
      max_total_walking_distance_m,
      max_walking_neighbors,
      walking_speed_mps,
      max_bus_transfers,
      walk_linear_coeff,
      walk_exp_coeff,
      walk_exp_scale_m,
      transfer_exp_coeff,
      transfer_exp_rate
    FROM user_routing_preferences
    WHERE user_id = $1
    `,
    [userId],
  );

  const stored = (prefRes.rows[0] as UserRoutingPreferenceRow | undefined) ?? null;
  const explicitTotalWalkingDistanceM = body.options?.maxTotalWalkingDistanceM
    ?? stored?.max_total_walking_distance_m
    ?? null;

  const hasExplicitSingleWalkingCap = body.options?.maxWalkingDistanceM != null
    || stored?.max_walking_distance_m != null;

  const maxWalkingDistanceM = hasExplicitSingleWalkingCap
    ? (body.options?.maxWalkingDistanceM
      ?? stored?.max_walking_distance_m
      ?? DEFAULT_ROUTING_CONFIG.maxWalkingDistanceM)
    : deriveDynamicMaxWalkingDistanceM(
      explicitTotalWalkingDistanceM ?? (DEFAULT_ROUTING_CONFIG.maxWalkingDistanceM * 2),
    );

  const maxTotalWalkingDistanceM = Math.max(
    explicitTotalWalkingDistanceM ?? (maxWalkingDistanceM * 2),
    maxWalkingDistanceM,
  );

  return {
    weights: normalizeWeights({
      speed: body.preferences?.speed
        ?? stored?.speed_weight
        ?? DEFAULT_ROUTING_WEIGHTS.speed,
      crowding: body.preferences?.crowding
        ?? stored?.crowding_weight
        ?? DEFAULT_ROUTING_WEIGHTS.crowding,
      price: body.preferences?.price
        ?? stored?.price_weight
        ?? DEFAULT_ROUTING_WEIGHTS.price,
      transfer: body.preferences?.transfer
        ?? stored?.transfer_weight
        ?? DEFAULT_ROUTING_WEIGHTS.transfer,
      walking: body.preferences?.walking
        ?? stored?.walking_weight
        ?? DEFAULT_ROUTING_WEIGHTS.walking,
    }),
    maxWalkingDistanceM,
    maxTotalWalkingDistanceM,
    maxWalkingNeighbors: body.options?.maxWalkingNeighbors
      ?? stored?.max_walking_neighbors
      ?? DEFAULT_ROUTING_CONFIG.maxWalkingNeighbors,
    maxBusTransfers: body.options?.maxBusTransfers
      ?? stored?.max_bus_transfers
      ?? DEFAULT_ROUTING_CONFIG.maxBusTransfers,
    walkingSpeedMps: body.options?.walkingSpeedMps
      ?? stored?.walking_speed_mps
      ?? DEFAULT_ROUTING_CONFIG.walkingSpeedMps,
    walkLinearCoeff: stored?.walk_linear_coeff ?? DEFAULT_ROUTING_CONFIG.walkLinearCoeff,
    walkExpCoeff: stored?.walk_exp_coeff ?? DEFAULT_ROUTING_CONFIG.walkExpCoeff,
    walkExpScaleM: stored?.walk_exp_scale_m ?? DEFAULT_ROUTING_CONFIG.walkExpScaleM,
    transferExpCoeff: stored?.transfer_exp_coeff ?? DEFAULT_ROUTING_CONFIG.transferExpCoeff,
    transferExpRate: stored?.transfer_exp_rate ?? DEFAULT_ROUTING_CONFIG.transferExpRate,
  };
}

export async function refreshRouteLiveMetrics(
  client: Awaited<ReturnType<FastifyInstance["pg"]["connect"]>>,
  routeId?: number,
) {
  const params: Array<number | null> = [routeId ?? null];
  await client.query(
    `
    WITH feedback_window AS (
      SELECT
        b.route_id,
        COUNT(*)::int AS reports_count,
        AVG(b.reported_price)::float8 AS avg_reported_price,
        AVG(b.crowding_level)::float8 AS avg_crowding_level,
        AVG(b.speed_level)::float8 AS avg_speed_level,
        AVG(b.slowness_level)::float8 AS avg_slowness_level,
        MAX(b.created_at) AS last_report_at
      FROM bus_feedback_reports b
      GROUP BY b.route_id
    ),
    base AS (
      SELECT
        r.id AS route_id,
        COALESCE(f.reports_count, 0) AS reports_count,
        f.avg_reported_price,
        f.avg_crowding_level,
        f.avg_speed_level,
        f.avg_slowness_level,
        f.last_report_at,
        LEAST(1.0, COALESCE(f.reports_count, 0)::float8 / 20.0) AS confidence
      FROM routes r
      LEFT JOIN feedback_window f ON f.route_id = r.id
      WHERE r.type = 'bus'
        AND ($1::int IS NULL OR r.id = $1::int)
    )
    INSERT INTO route_live_metrics (
      route_id,
      reports_count,
      confidence_score,
      avg_reported_price,
      avg_crowding_level,
      avg_speed_level,
      avg_slowness_level,
      effective_price,
      effective_speed_score,
      effective_crowding_score,
      effective_slowness_multiplier,
      suggested_avg_speed_kmh,
      last_report_at,
      updated_at
    )
    SELECT
      b.route_id,
      b.reports_count,
      b.confidence,
      b.avg_reported_price,
      b.avg_crowding_level,
      b.avg_speed_level,
      b.avg_slowness_level,
      b.avg_reported_price AS effective_price,
      COALESCE(b.avg_speed_level, CASE WHEN b.avg_slowness_level IS NULL THEN NULL ELSE (6.0 - b.avg_slowness_level) END) AS effective_speed_score,
      b.avg_crowding_level AS effective_crowding_score,
      CASE
        WHEN b.avg_slowness_level IS NULL THEN 1.0
        ELSE 1.0 + (((b.avg_slowness_level - 1.0) / 4.0) * 0.6)
      END AS effective_slowness_multiplier,
      NULL::float8 AS suggested_avg_speed_kmh,
      b.last_report_at,
      NOW()
    FROM base b
    ON CONFLICT (route_id) DO UPDATE
      SET reports_count = EXCLUDED.reports_count,
          confidence_score = EXCLUDED.confidence_score,
          avg_reported_price = EXCLUDED.avg_reported_price,
          avg_crowding_level = EXCLUDED.avg_crowding_level,
          avg_speed_level = EXCLUDED.avg_speed_level,
          avg_slowness_level = EXCLUDED.avg_slowness_level,
          effective_price = EXCLUDED.effective_price,
          effective_speed_score = EXCLUDED.effective_speed_score,
          effective_crowding_score = EXCLUDED.effective_crowding_score,
          effective_slowness_multiplier = EXCLUDED.effective_slowness_multiplier,
          suggested_avg_speed_kmh = EXCLUDED.suggested_avg_speed_kmh,
          last_report_at = EXCLUDED.last_report_at,
          updated_at = EXCLUDED.updated_at
    `,
    params,
  );
}

export const saveRoutingPreferences = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const debugRoutingLogs = process.env.DEBUG_ROUTING_LOGS === "1" || process.env.NODE_ENV !== "production";

  const userPayload = request.user as { id?: number | string };
  const userId = Number(userPayload?.id);

  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  const body = request.body as SetRoutingPreferencesBody;
  const client = await fastify.pg.connect();
  try {
    if (debugRoutingLogs) {
      fastify.log.info(
        {
          userId,
          incomingPreferences: body.preferences ?? null,
          incomingOptions: body.options ?? null,
        },
        "Routing preferences save request",
      );
    }

    const current = await getEffectiveRoutingConfig(
      client,
      userId,
      {
        from: { lat: 0, lng: 0 },
        to: { lat: 0, lng: 0 },
      },
    );

    const nextWeightsRaw = {
      speed: body.preferences?.speed ?? current.weights.speed,
      crowding: body.preferences?.crowding ?? current.weights.crowding,
      price: body.preferences?.price ?? current.weights.price,
      transfer: body.preferences?.transfer ?? current.weights.transfer,
      walking: body.preferences?.walking ?? current.weights.walking,
    };

    const nextWeights = normalizeWeights(nextWeightsRaw);
    const nextMaxWalkingDistanceM = body.options?.maxWalkingDistanceM ?? current.maxWalkingDistanceM;
    const nextMaxTotalWalkingDistanceM = Math.max(
      body.options?.maxTotalWalkingDistanceM
        ?? (body.options?.maxWalkingDistanceM != null
          ? body.options.maxWalkingDistanceM * 2
          : current.maxTotalWalkingDistanceM),
      nextMaxWalkingDistanceM,
    );

    await client.query(
      `
      INSERT INTO user_routing_preferences (
        user_id,
        speed_weight,
        crowding_weight,
        price_weight,
        transfer_weight,
        walking_weight,
        max_walking_distance_m,
        max_total_walking_distance_m,
        max_walking_neighbors,
        max_bus_transfers,
        walking_speed_mps,
        walk_linear_coeff,
        walk_exp_coeff,
        walk_exp_scale_m,
        transfer_exp_coeff,
        transfer_exp_rate,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
        SET speed_weight = EXCLUDED.speed_weight,
            crowding_weight = EXCLUDED.crowding_weight,
            price_weight = EXCLUDED.price_weight,
            transfer_weight = EXCLUDED.transfer_weight,
            walking_weight = EXCLUDED.walking_weight,
            max_walking_distance_m = EXCLUDED.max_walking_distance_m,
            max_total_walking_distance_m = EXCLUDED.max_total_walking_distance_m,
            max_walking_neighbors = EXCLUDED.max_walking_neighbors,
            max_bus_transfers = EXCLUDED.max_bus_transfers,
            walking_speed_mps = EXCLUDED.walking_speed_mps,
            walk_linear_coeff = EXCLUDED.walk_linear_coeff,
            walk_exp_coeff = EXCLUDED.walk_exp_coeff,
            walk_exp_scale_m = EXCLUDED.walk_exp_scale_m,
            transfer_exp_coeff = EXCLUDED.transfer_exp_coeff,
            transfer_exp_rate = EXCLUDED.transfer_exp_rate,
            updated_at = NOW()
      `,
      [
        userId,
        nextWeights.speed,
        nextWeights.crowding,
        nextWeights.price,
        nextWeights.transfer,
        nextWeights.walking,
        nextMaxWalkingDistanceM,
        nextMaxTotalWalkingDistanceM,
        body.options?.maxWalkingNeighbors ?? current.maxWalkingNeighbors,
        body.options?.maxBusTransfers ?? current.maxBusTransfers,
        body.options?.walkingSpeedMps ?? current.walkingSpeedMps,
        current.walkLinearCoeff,
        current.walkExpCoeff,
        current.walkExpScaleM,
        current.transferExpCoeff,
        current.transferExpRate,
      ],
    );

    if (debugRoutingLogs) {
      fastify.log.info(
        {
          userId,
          savedPreferences: nextWeights,
          savedOptions: {
            maxWalkingDistanceM: nextMaxWalkingDistanceM,
            maxTotalWalkingDistanceM: nextMaxTotalWalkingDistanceM,
            maxWalkingNeighbors: body.options?.maxWalkingNeighbors ?? current.maxWalkingNeighbors,
            maxBusTransfers: body.options?.maxBusTransfers ?? current.maxBusTransfers,
            walkingSpeedMps: body.options?.walkingSpeedMps ?? current.walkingSpeedMps,
          },
        },
        "Routing preferences saved",
      );
    }

    return reply.send({
      message: "Routing preferences saved",
      preferences: nextWeights,
      options: {
        maxWalkingDistanceM: nextMaxWalkingDistanceM,
        maxTotalWalkingDistanceM: nextMaxTotalWalkingDistanceM,
        maxWalkingNeighbors: body.options?.maxWalkingNeighbors ?? current.maxWalkingNeighbors,
        maxBusTransfers: body.options?.maxBusTransfers ?? current.maxBusTransfers,
        walkingSpeedMps: body.options?.walkingSpeedMps ?? current.walkingSpeedMps,
      },
    });
  } finally {
    client.release();
  }
};

export async function requireDriverRole(
  client: QueryableClient,
  userId: number,
): Promise<string | null> {
  const result = await client.query<{ role: string | null }>(
    "SELECT role FROM users WHERE id = $1",
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].role;
}

type AvailabilityQueryRow = {
  route_id: number;
  active_driver_count: number;
  max_active_buses: number;
  availability_ratio: number;
  availability_updated_at: string | null;
};

type AvailabilitySource = {
  query: QueryableClient["query"];
};

export async function readCurrentAvailability(
  source: AvailabilitySource,
  routeId?: number,
) {
  const params: Array<number | null> = [routeId ?? null];
  const result = await source.query<AvailabilityQueryRow>(`
    SELECT
      r.id AS route_id,
      COALESCE(a.active_driver_count, 0)::int AS active_driver_count,
      COALESCE(r.max_active_buses, 1)::int AS max_active_buses,
      CASE
        WHEN COALESCE(r.max_active_buses, 1) > 0
          THEN LEAST(1.0, GREATEST(0.0, COALESCE(a.active_driver_count, 0)::float8 / NULLIF(r.max_active_buses, 0)))
        ELSE 0
      END AS availability_ratio,
      a.updated_at AS availability_updated_at
    FROM routes r
    LEFT JOIN route_driver_availability a ON a.route_id = r.id
    WHERE r.type = 'bus'
      AND ($1::int IS NULL OR r.id = $1::int)
    ORDER BY r.id ASC
  `, params);

  return result.rows.map(mapRouteAvailabilityRow);
}
