import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import {
  deleteUserTravelHistorySchema,
  deleteBussesSchema,
  deleteBusSchema,
  graphCacheQuerySchema,
  getBusFeedbackSummarySchema,
  getRouteLiveMetricsSchema,
  getUserTravelHistorySchema,
  getGraphSchema,
  getBusSchema,
  getBussesSchema,
  invalidateGraphSchema,
  submitBusFeedbackSchema,
} from "../schemas/bus";
import type {
  DeleteUserTravelHistoryQuery,
  DeleteBusesQuery,
  DeleteBusQuery,
  GetBusFeedbackSummaryQuery,
  GetBusQuery,
  GetBusesQuery,
  GetGraphQuery,
  GetRouteLiveMetricsQuery,
  GetUserTravelHistoryQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
  SubmitBusFeedbackBody,
} from "../../../types/bus";
import type {
  EffectiveRoutingConfig,
  NavigationRouteResult,
  NavigationRouteRequestBody,
  RouteLiveMetricForRouting,
  RoutingWorkerPayload,
  RoutingPreferenceWeights,
} from "../../../types/navigation";
import { graphCache } from "../services/graphCache";
import { routingWorkerClient } from "../services/routingWorkerClient";
import {
  DEFAULT_MAX_BUS_TRANSFERS,
  TRANSFER_EXP_COEFF,
  TRANSFER_EXP_RATE,
  WALK_EXP_COEFF,
  WALK_EXP_SCALE_M,
  WALK_LINEAR_COEFF,
} from "../constants/routingConstants";

const DEFAULT_ROUTING_WEIGHTS: RoutingPreferenceWeights = {
  speed: 1,
  crowding: 1,
  price: 1,
  transfer: 1,
  walking: 1,
};

const DEFAULT_ROUTING_CONFIG = {
  maxWalkingDistanceM: 1000,
  maxTotalWalkingDistanceM: 2000,
  maxWalkingNeighbors: 12,
  maxBusTransfers: DEFAULT_MAX_BUS_TRANSFERS,
  walkingSpeedMps: 1.25,
  walkLinearCoeff: WALK_LINEAR_COEFF,
  walkExpCoeff: WALK_EXP_COEFF,
  walkExpScaleM: WALK_EXP_SCALE_M,
  transferExpCoeff: TRANSFER_EXP_COEFF,
  transferExpRate: TRANSFER_EXP_RATE,
};

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

function normalizeWeights(weights: RoutingPreferenceWeights): RoutingPreferenceWeights {
  const raw = {
    speed: Math.max(0, weights.speed),
    crowding: Math.max(0, weights.crowding),
    price: Math.max(0, weights.price),
    transfer: Math.max(0, weights.transfer),
    walking: Math.max(0, weights.walking),
  };

  const sum = raw.speed + raw.crowding + raw.price + raw.transfer + raw.walking;
  if (sum <= 0) {
    return {
      speed: 0.2,
      crowding: 0.2,
      price: 0.2,
      transfer: 0.2,
      walking: 0.2,
    };
  }

  return {
    speed: raw.speed / sum,
    crowding: raw.crowding / sum,
    price: raw.price / sum,
    transfer: raw.transfer / sum,
    walking: raw.walking / sum,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveDynamicMaxWalkingDistanceM(maxTotalWalkingDistanceM: number): number {
  // Keep single-walk cap proportional to total budget while staying within API bounds.
  return clampNumber(maxTotalWalkingDistanceM * 0.35, 300, 2000);
}

async function getEffectiveRoutingConfig(
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

  const maxTotalWalkingDistanceM = explicitTotalWalkingDistanceM
    ?? (maxWalkingDistanceM * 2);

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
    walkLinearCoeff: body.options?.walkLinearCoeff
      ?? stored?.walk_linear_coeff
      ?? DEFAULT_ROUTING_CONFIG.walkLinearCoeff,
    walkExpCoeff: body.options?.walkExpCoeff
      ?? stored?.walk_exp_coeff
      ?? DEFAULT_ROUTING_CONFIG.walkExpCoeff,
    walkExpScaleM: body.options?.walkExpScaleM
      ?? stored?.walk_exp_scale_m
      ?? DEFAULT_ROUTING_CONFIG.walkExpScaleM,
    transferExpCoeff: body.options?.transferExpCoeff
      ?? stored?.transfer_exp_coeff
      ?? DEFAULT_ROUTING_CONFIG.transferExpCoeff,
    transferExpRate: body.options?.transferExpRate
      ?? stored?.transfer_exp_rate
      ?? DEFAULT_ROUTING_CONFIG.transferExpRate,
  };
}

async function refreshRouteLiveMetrics(
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

export async function busRoutes(fastify: FastifyInstance) {
  const workerTimeoutMs = Number(process.env.ROUTING_WORKER_TIMEOUT_MS ?? 2500);

  async function routeWithFallback(payload: {
    base: Omit<RoutingWorkerPayload, "walkingMode">;
  }): Promise<NavigationRouteResult> {
    const runAttempt = async (walkingMode: "dynamic" | "precomputed") => {
      const startedAt = Date.now();
      try {
        const result = await routingWorkerClient.route(
          { ...payload.base, walkingMode },
          { timeoutMs: workerTimeoutMs },
        );
        fastify.log.info(
          { walkingMode, elapsedMs: Date.now() - startedAt },
          "Routing attempt succeeded",
        );
        return result;
      } catch (error) {
        fastify.log.warn(
          {
            walkingMode,
            elapsedMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          },
          "Routing attempt failed",
        );
        throw error;
      }
    };

    // Attempt 1: dynamic walking
    try {
      const result = await runAttempt("dynamic");
      return { ...result, bestEffort: false };
    } catch (error) {
      fastify.log.warn({ error }, "Dynamic walking routing failed, trying precomputed walking");
    }

    // Attempt 2: precomputed walking edges
    try {
      const result = await runAttempt("precomputed");
      return { ...result, bestEffort: false };
    } catch (error) {
      fastify.log.warn({ error }, "Precomputed walking routing failed, trying relaxed best-effort route");
    }

    // Attempt 3: relaxed best-effort (loosen total walking + transfers)
    const relaxedConfig: EffectiveRoutingConfig = {
      ...payload.base.config,
      maxTotalWalkingDistanceM: Number.MAX_SAFE_INTEGER,
      maxBusTransfers: Math.max(payload.base.config.maxBusTransfers, 10),
    };

    const relaxedPayload: RoutingWorkerPayload = {
      ...payload.base,
      config: relaxedConfig,
      walkingMode: "dynamic",
    };

    const result = await routingWorkerClient.route(relaxedPayload, { timeoutMs: workerTimeoutMs });
    return { ...result, bestEffort: true };
  }

  fastify.post(
    "/navigation/route",
    {
      preHandler: [fastify.authenticate],
      schema: navigationRouteSchema,
    },
    async (request, reply) => {
      const snapshot = await graphCache.getSnapshot(fastify);
      const body = request.body as NavigationRouteRequestBody;
      const userPayload = request.user as { id?: number | string };
      const userId = Number(userPayload?.id);

      if (!Number.isFinite(userId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const client = await fastify.pg.connect();
      try {
        const metricsRes = await client.query<{
          route_id: number;
          effective_price: number | null;
          effective_speed_score: number | null;
          effective_crowding_score: number | null;
          effective_slowness_multiplier: number | null;
        }>(
          `
          SELECT
            route_id,
            effective_price,
            effective_speed_score,
            effective_crowding_score,
            effective_slowness_multiplier
          FROM route_live_metrics
          `,
        );

        const routeMetrics: RouteLiveMetricForRouting[] = metricsRes.rows.map((row: {
          route_id: number;
          effective_price: number | null;
          effective_speed_score: number | null;
          effective_crowding_score: number | null;
          effective_slowness_multiplier: number | null;
        }) => ({
          routeId: row.route_id,
          effectivePrice: row.effective_price,
          effectiveSpeedScore: row.effective_speed_score,
          effectiveCrowdingScore: row.effective_crowding_score,
          effectiveSlownessMultiplier: row.effective_slowness_multiplier,
        }));

        const config = await getEffectiveRoutingConfig(client, userId, body);
        const configJson = JSON.stringify(config);

        const cachedRes = await client.query<{
          graph_version: string | null;
          pathfinding_result: NavigationRouteResult | null;
        }>(
          `
          SELECT graph_version, pathfinding_result
          FROM travel_history
          WHERE user_id = $1
            AND origin_lat = $2
            AND origin_lng = $3
            AND dest_lat = $4
            AND dest_lng = $5
            AND pathfinding_result IS NOT NULL
          ORDER BY traveled_at DESC
          LIMIT 1
          `,
          [
            userId,
            body.from.lat,
            body.from.lng,
            body.to.lat,
            body.to.lng,
          ],
        );

        const cached = cachedRes.rows[0] ?? null;
        const cachedResult = cached?.pathfinding_result ?? null;
        if (
          cachedResult
          && cached.graph_version === snapshot.graphVersion
          && JSON.stringify(cachedResult.usedConfig) === configJson
        ) {
          return cachedResult;
        }

        let routeResult: NavigationRouteResult;
        try {
          routeResult = await routeWithFallback({
            base: {
              from: body.from,
              to: body.to,
              graph: snapshot,
              routeMetrics,
              config,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isTimeout = /timed out/i.test(message);
          return reply.code(isTimeout ? 504 : 500).send({
            error: isTimeout
              ? "Routing timed out while searching for a path"
              : "Routing failed while searching for a path",
            details: message,
          });
        }

        const now = new Date();
        const dayOfWeek = now.getDay();
        const hourOfDay = now.getHours();
        const routeIds = Array.from(
          new Set(
            routeResult.segments
              .filter((segment) => segment.mode === "bus" && typeof segment.routeId === "number")
              .map((segment) => segment.routeId as number),
          ),
        );
        const totalDistanceM = routeResult.segments.reduce((sum, segment) => sum + segment.distanceM, 0);

        try {
          await client.query(
            `
            INSERT INTO travel_history (
              user_id,
              origin_lat,
              origin_lng,
              dest_lat,
              dest_lng,
              origin_label,
              dest_label,
              route_ids,
              transfer_count,
              best_effort,
              total_distance_m,
              total_duration_seconds,
              graph_version,
              pathfinding_result,
              day_of_week,
              hour_of_day,
              traveled_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17
            )
            `,
            [
              userId,
              body.from.lat,
              body.from.lng,
              body.to.lat,
              body.to.lng,
              body.from.label ?? null,
              body.to.label ?? null,
              routeIds.length > 0 ? routeIds : null,
              routeResult.transferCount,
              routeResult.bestEffort,
              totalDistanceM,
              routeResult.etaSeconds,
              routeResult.graphVersion,
              JSON.stringify(routeResult as NavigationRouteResult),
              dayOfWeek,
              hourOfDay,
              now,
            ],
          );
        } catch (historyError) {
          fastify.log.warn({ error: historyError }, "Failed to persist navigation history entry");
        }

        return routeResult;
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/navigation/history",
    {
      preHandler: [fastify.authenticate],
      schema: getUserTravelHistorySchema,
    },
    async (request, reply) => {
      const query = request.query as GetUserTravelHistoryQuery;
      const userPayload = request.user as { id?: number | string };
      const userId = Number(userPayload?.id);

      if (!Number.isFinite(userId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const client = await fastify.pg.connect();
      try {
        const countRes = await client.query<{ total: number }>(
          "SELECT COUNT(*)::int AS total FROM travel_history WHERE user_id = $1",
          [userId],
        );

        const rowsRes = await client.query<{
          id: number;
          origin_lat: number;
          origin_lng: number;
          dest_lat: number;
          dest_lng: number;
          origin_label: string | null;
          dest_label: string | null;
          route_ids: number[] | null;
          transfer_count: number | null;
          total_distance_m: number | null;
          total_duration_seconds: number | null;
          day_of_week: number;
          hour_of_day: number;
          traveled_at: string | null;
          pathfinding_result: unknown;
        }>(
          `
          SELECT
            id,
            origin_lat,
            origin_lng,
            dest_lat,
            dest_lng,
            origin_label,
            dest_label,
            route_ids,
            transfer_count,
            total_distance_m,
            total_duration_seconds,
            day_of_week,
            hour_of_day,
            traveled_at,
            pathfinding_result
          FROM travel_history
          WHERE user_id = $1
          ORDER BY traveled_at DESC, id DESC
          LIMIT $2 OFFSET $3
          `,
          [userId, limit, offset],
        );

        return {
          limit,
          offset,
          total: countRes.rows[0]?.total ?? 0,
          items: rowsRes.rows.map((row: {
            id: number;
            origin_lat: number;
            origin_lng: number;
            dest_lat: number;
            dest_lng: number;
            origin_label: string | null;
            dest_label: string | null;
            route_ids: number[] | null;
            transfer_count: number | null;
            total_distance_m: number | null;
            total_duration_seconds: number | null;
            day_of_week: number;
            hour_of_day: number;
            traveled_at: string | null;
            pathfinding_result: unknown;
          }) => ({
            id: row.id,
            originLat: row.origin_lat,
            originLng: row.origin_lng,
            destLat: row.dest_lat,
            destLng: row.dest_lng,
            originLabel: row.origin_label,
            destLabel: row.dest_label,
            routeIds: row.route_ids,
            transferCount: row.transfer_count,
            totalDistanceM: row.total_distance_m,
            totalDurationSeconds: row.total_duration_seconds,
            dayOfWeek: row.day_of_week,
            hourOfDay: row.hour_of_day,
            traveledAt: row.traveled_at,
            pathfindingResult: row.pathfinding_result,
          })),
        };
      } finally {
        client.release();
      }
    },
  );

  fastify.delete(
    "/navigation/history",
    {
      preHandler: [fastify.authenticate],
      schema: deleteUserTravelHistorySchema,
    },
    async (request, reply) => {
      const query = request.query as DeleteUserTravelHistoryQuery;
      const userPayload = request.user as { id?: number | string };
      const userId = Number(userPayload?.id);

      if (!Number.isFinite(userId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const client = await fastify.pg.connect();
      try {
        const result = await client.query(
          "DELETE FROM travel_history WHERE id = $1 AND user_id = $2 RETURNING id",
          [query.id, userId],
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: "History entry not found" });
        }

        return { message: "History entry deleted successfully" };
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/graph/cache",
    {
      preHandler: [fastify.authenticate],
      schema: graphCacheQuerySchema,
    },
    async (request, reply) => {
      const query = request.query as GraphCacheQuery;
      await graphCache.getSnapshot(fastify, query.forceRefresh ?? false);
      return graphCache.getStatus();
    },
  );

  fastify.post(
    "/graph/invalidate",
    {
      preHandler: [fastify.authenticate],
      schema: invalidateGraphSchema,
    },
    async (request, reply) => {
      const query = request.query as InvalidateGraphQuery;
      const rebuild = query.rebuild ?? true;
      const wait = query.wait ?? false;

      if (!rebuild) {
        graphCache.invalidate();
        return { message: "Graph cache invalidated" };
      }

      if (wait) {
        await graphCache.invalidateAndRebuild(fastify, true);
        return { message: "Graph invalidated, rebuilt, and cache refreshed" };
      }

      void graphCache.invalidateAndRebuild(fastify, false);
      return reply.code(202).send({ message: "Graph invalidated; rebuild started in background" });
    },
  );

  fastify.get(
    "/graph",
    {
      preHandler: [fastify.authenticate],
      schema: getGraphSchema,
    },
    async (request, reply) => {
      const query = request.query as GetGraphQuery;
      const snapshot = await graphCache.getSnapshot(fastify, query.forceRefresh ?? false);

      const graph = {
        loadedAt: snapshot.loadedAt,
        routes: query.includeRoutes === false ? [] : snapshot.routes,
        nodes: query.includeNodes === false ? [] : snapshot.nodes,
        edges: query.includeEdges === false ? [] : snapshot.edges,
        routeNodes: query.includeRouteNodes === false ? [] : snapshot.routeNodes,
      };

      reply.header("x-graph-loaded-at", snapshot.loadedAt);
      return graph;
    },
  );

  fastify.get(
    "/busses",
    {
      preHandler: [fastify.authenticate],
      schema: getBussesSchema,
    },
    async (request, reply) => {
      const query = request.query as GetBusesQuery;
      const client = await fastify.pg.connect();
      try {
        const whereClauses: string[] = ["type = $1"];
        const values: Array<string | number> = ["bus"];

        if (query.name) {
          values.push(`%${query.name}%`);
          whereClauses.push(`name ILIKE $${values.length}`);
        }

        if (query.crowdingTendency) {
          values.push(query.crowdingTendency);
          whereClauses.push(`crowding_tendency = $${values.length}`);
        }

        if (typeof query.minSpeedKmh === "number") {
          values.push(query.minSpeedKmh);
          whereClauses.push(`avg_speed_kmh >= $${values.length}`);
        }

        if (typeof query.maxSpeedKmh === "number") {
          values.push(query.maxSpeedKmh);
          whereClauses.push(`avg_speed_kmh <= $${values.length}`);
        }

        const limit = query.limit ?? 100;
        const offset = query.offset ?? 0;
        values.push(limit);
        const limitPosition = values.length;
        values.push(offset);
        const offsetPosition = values.length;

        const sql = `
          SELECT *
          FROM routes
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY id ASC
          LIMIT $${limitPosition}
          OFFSET $${offsetPosition}
        `;

        const res = await client.query(sql, values);
        return {
          busses: res.rows,
        };
      } finally {
        client.release();
      }
    }
  );

  fastify.get(
    "/bus",
    {
      preHandler: [fastify.authenticate],
      schema: getBusSchema,
    },
    async (request, reply) => {
      const query = request.query as GetBusQuery;
      const client = await fastify.pg.connect();
      try {
        const res = await client.query(
          "SELECT * FROM routes WHERE type = $1 AND id = $2",
          ["bus", query.id],
        );
        return {
          busses: res.rows,
        };
      } finally {
        client.release();
      }
    }
  );

  fastify.post(
    "/bus/feedback",
    {
      preHandler: [fastify.authenticate],
      schema: submitBusFeedbackSchema,
    },
    async (request, reply) => {
      const body = request.body as SubmitBusFeedbackBody;
      const userPayload = request.user as { id?: number | string };
      const userId = Number(userPayload?.id);

      if (!Number.isFinite(userId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const hasAnyMetric =
        typeof body.reportedPrice === "number"
        || typeof body.crowdingLevel === "number"
        || typeof body.speedLevel === "number"
        || typeof body.slownessLevel === "number"
        || (typeof body.comment === "string" && body.comment.trim().length > 0);

      if (!hasAnyMetric) {
        return reply.code(400).send({
          error: "At least one feedback value is required (price, crowding, speed, slowness, or comment)",
        });
      }

      const client = await fastify.pg.connect();
      try {
        const routeCheck = await client.query(
          "SELECT id FROM routes WHERE id = $1 AND type = $2",
          [body.routeId, "bus"],
        );

        if (routeCheck.rows.length === 0) {
          return reply.code(404).send({ error: "Bus route not found" });
        }

        const insertRes = await client.query(
          `
          INSERT INTO bus_feedback_reports
            (route_id, user_id, reported_price, crowding_level, speed_level, slowness_level, comment)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (route_id, user_id)
          DO UPDATE SET
            reported_price = COALESCE(EXCLUDED.reported_price, bus_feedback_reports.reported_price),
            crowding_level = COALESCE(EXCLUDED.crowding_level, bus_feedback_reports.crowding_level),
            speed_level = COALESCE(EXCLUDED.speed_level, bus_feedback_reports.speed_level),
            slowness_level = COALESCE(EXCLUDED.slowness_level, bus_feedback_reports.slowness_level),
            comment = COALESCE(EXCLUDED.comment, bus_feedback_reports.comment),
            created_at = CURRENT_TIMESTAMP
          RETURNING id
          `,
          [
            body.routeId,
            userId,
            body.reportedPrice ?? null,
            body.crowdingLevel ?? null,
            body.speedLevel ?? null,
            body.slownessLevel ?? null,
            body.comment?.trim() || null,
          ],
        );

        await refreshRouteLiveMetrics(client, body.routeId);
        

        return reply.code(200).send({
          message: "Feedback saved successfully",
          reportId: insertRes.rows[0].id,
        });
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/bus/live-metrics",
    {
      preHandler: [fastify.authenticate],
      schema: getRouteLiveMetricsSchema,
    },
    async (request) => {
      const query = request.query as GetRouteLiveMetricsQuery;
      const refresh = query.refresh ?? true;
      const client = await fastify.pg.connect();
      try {
        if (refresh) {
          await refreshRouteLiveMetrics(client, query.routeId);
        }

        type RouteLiveMetricRow = {
          route_id: number;
          reports_count: number;
          confidence_score: number;
          avg_reported_price: number | null;
          avg_crowding_level: number | null;
          avg_speed_level: number | null;
          avg_slowness_level: number | null;
          effective_price: number | null;
          effective_speed_score: number | null;
          effective_crowding_score: number | null;
          effective_slowness_multiplier: number;
          suggested_avg_speed_kmh: number | null;
          last_report_at: string | null;
          updated_at: string | null;
        };

        const params: Array<number | null> = [query.routeId ?? null];
        const result = await client.query<RouteLiveMetricRow>(
          `
          SELECT
            m.route_id,
            m.reports_count,
            m.confidence_score,
            m.avg_reported_price,
            m.avg_crowding_level,
            m.avg_speed_level,
            m.avg_slowness_level,
            m.effective_price,
            m.effective_speed_score,
            m.effective_crowding_score,
            m.effective_slowness_multiplier,
            m.suggested_avg_speed_kmh,
            m.last_report_at,
            m.updated_at
          FROM route_live_metrics m
          WHERE ($1::int IS NULL OR m.route_id = $1::int)
          ORDER BY m.route_id ASC
          `,
          params,
        );

        return {
          metrics: result.rows.map((row: RouteLiveMetricRow) => ({
            routeId: row.route_id,
            reportsCount: row.reports_count,
            confidenceScore: row.confidence_score,
            avgReportedPrice: row.avg_reported_price,
            avgCrowdingLevel: row.avg_crowding_level,
            avgSpeedLevel: row.avg_speed_level,
            avgSlownessLevel: row.avg_slowness_level,
            effectivePrice: row.effective_price,
            effectiveSpeedScore: row.effective_speed_score,
            effectiveCrowdingScore: row.effective_crowding_score,
            effectiveSlownessMultiplier: row.effective_slowness_multiplier,
            suggestedAvgSpeedKmh: row.suggested_avg_speed_kmh,
            lastReportAt: row.last_report_at,
            updatedAt: row.updated_at,
          })),
        };
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/bus/feedback/summary",
    {
      preHandler: [fastify.authenticate],
      schema: getBusFeedbackSummarySchema,
    },
    async (request, reply) => {
      const query = request.query as GetBusFeedbackSummaryQuery;
      const days = query.days ?? 30;
      const client = await fastify.pg.connect();
      try {
        const result = await client.query(
          `
          SELECT
            COUNT(*)::int AS reports_count,
            AVG(reported_price)::float8 AS avg_price,
            AVG(crowding_level)::float8 AS avg_crowding_level,
            AVG(speed_level)::float8 AS avg_speed_level,
            AVG(slowness_level)::float8 AS avg_slowness_level,
            MAX(created_at) AS last_report_at
          FROM bus_feedback_reports
          WHERE route_id = $1
            AND created_at >= NOW() - ($2::text || ' days')::interval
          `,
          [query.routeId, days],
        );

        const row = result.rows[0];
        const avgCrowding = row.avg_crowding_level as number | null;
        let crowdingTendency: "low" | "medium" | "high" | null = null;
        if (typeof avgCrowding === "number") {
          if (avgCrowding < 2.5) {
            crowdingTendency = "low";
          } else if (avgCrowding < 3.5) {
            crowdingTendency = "medium";
          } else {
            crowdingTendency = "high";
          }
        }

        const avgSlowness = row.avg_slowness_level as number | null;
        const speedMultiplierSuggestion =
          typeof avgSlowness === "number"
            ? Number((1 + ((avgSlowness - 1) / 4) * 0.6).toFixed(3))
            : null;

        return {
          routeId: query.routeId,
          windowDays: days,
          reportsCount: row.reports_count,
          avgPrice: row.avg_price,
          avgCrowdingLevel: row.avg_crowding_level,
          avgSpeedLevel: row.avg_speed_level,
          avgSlownessLevel: row.avg_slowness_level,
          crowdingTendency,
          speedMultiplierSuggestion,
          lastReportAt: row.last_report_at,
        };
      } finally {
        client.release();
      }
    },
  );

  fastify.delete(
    "/bus",
    {
      preHandler: [fastify.authenticate],
      schema: deleteBusSchema,
    },
    async (request, reply) => {
      const client = await fastify.pg.connect();
      const query = request.query as DeleteBusQuery;
      try {
        await client.query("DELETE FROM routes WHERE type = $1 AND id = $2", ["bus", query.id]);
        if (query.invalidateGraph ?? true) {
          graphCache.invalidate();
        }
        return {
          message: "Bus deleted successfully",
        };
      } finally {
        client.release();
      }
    }
  );
    fastify.delete(
    "/busses",
    {
      preHandler: [fastify.authenticate],
      schema: deleteBussesSchema,
    },
    async (request, reply) => {
      const client = await fastify.pg.connect();
      const query = request.query as DeleteBusesQuery;
      try {
        await client.query("DELETE FROM routes WHERE type = $1 ", ["bus"]);
        if (query.invalidateGraph ?? true) {
          graphCache.invalidate();
        }
        return {
          message: "Busses deleted successfully",
        };
      } finally {
        client.release();
      }
    }
  );
  fastify.post(
    "/busses/price", 
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {      const client = await fastify.pg.connect();
      try {
        await client.query(`UPDATE routes
          SET base_price = base_price * 1.10
          WHERE type = 'bus' AND base_price IS NOT NULL`);
        
        return {
          message: "Bus prices increased by 10%",
        };
      } finally {        client.release();
      }
    
    }
  )
}
