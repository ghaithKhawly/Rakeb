import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  DeleteUserTravelHistoryQuery,
  GetUserTravelHistoryQuery,
  SaveUserTravelHistoryBody,
} from "../../../../types/bus";
import type { NavigationRouteResult, RouteSegment } from "../../../../types/navigation";

type TravelHistoryRow = {
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
};

function isRouteSegment(value: unknown): value is RouteSegment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const segment = value as Partial<RouteSegment>;
  return (
    (segment.mode === "walk" || segment.mode === "bus")
    && typeof segment.distanceM === "number"
    && typeof segment.timeSeconds === "number"
  );
}

function isNavigationRouteResult(value: unknown): value is NavigationRouteResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const route = value as Partial<NavigationRouteResult>;
  return (
    !!route.from
    && typeof route.from.lat === "number"
    && typeof route.from.lng === "number"
    && !!route.to
    && typeof route.to.lat === "number"
    && typeof route.to.lng === "number"
    && typeof route.transferCount === "number"
    && typeof route.etaSeconds === "number"
    && typeof route.bestEffort === "boolean"
    && Array.isArray(route.segments)
    && route.segments.every(isRouteSegment)
  );
}

function getRouteIds(routeResult: NavigationRouteResult) {
  return Array.from(
    new Set(
      routeResult.segments
        .filter((segment) => segment.mode === "bus" && typeof segment.routeId === "number")
        .map((segment) => segment.routeId as number),
    ),
  );
}

function getTotalDistanceM(routeResult: NavigationRouteResult) {
  return routeResult.segments.reduce((sum, segment) => sum + segment.distanceM, 0);
}

export async function saveTravelHistory(
  client: Awaited<ReturnType<FastifyInstance["pg"]["connect"]>>,
  payload: {
    userId: number;
    from: { lat: number; lng: number; label?: string };
    to: { lat: number; lng: number; label?: string };
    routeIds: number[];
    transferCount: number;
    bestEffort: boolean;
    totalDistanceM: number;
    etaSeconds: number;
    graphVersion: string;
    pathfindingResult: unknown;
    traveledAt: Date;
  },
) {
  const dayOfWeek = payload.traveledAt.getDay();
  const hourOfDay = payload.traveledAt.getHours();

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
      payload.userId,
      payload.from.lat,
      payload.from.lng,
      payload.to.lat,
      payload.to.lng,
      payload.from.label ?? null,
      payload.to.label ?? null,
      payload.routeIds.length > 0 ? payload.routeIds : null,
      payload.transferCount,
      payload.bestEffort,
      payload.totalDistanceM,
      payload.etaSeconds,
      payload.graphVersion,
      JSON.stringify(payload.pathfindingResult),
      dayOfWeek,
      hourOfDay,
      payload.traveledAt,
    ],
  );
}

export async function listUserTravelHistoryHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
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
      "SELECT COUNT(*)::int AS total FROM travel_history WHERE user_id = $1 AND pathfinding_result ? 'tripFinishedAt'",
      [userId],
    );

    const rowsRes = await client.query<TravelHistoryRow>(
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
        AND pathfinding_result ? 'tripFinishedAt'
      ORDER BY traveled_at DESC, id DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );

    return {
      limit,
      offset,
      total: countRes.rows[0]?.total ?? 0,
      items: rowsRes.rows.map((row: TravelHistoryRow) => ({
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
}

export async function saveUserTravelHistoryHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as SaveUserTravelHistoryBody;
  const userPayload = request.user as { id?: number | string };
  const userId = Number(userPayload?.id);

  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  if (!isNavigationRouteResult(body.routeResult)) {
    return reply.code(400).send({ error: "A valid routeResult is required" });
  }

  const routeResult = body.routeResult;
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  const traveledAt = body.finishedAt ? new Date(body.finishedAt) : new Date();
  const safeTraveledAt = Number.isNaN(traveledAt.getTime()) ? new Date() : traveledAt;
  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    return reply.code(400).send({ error: "A valid startedAt timestamp is required" });
  }

  const actualDurationSeconds = Math.max(
    0,
    Math.round((safeTraveledAt.getTime() - startedAt.getTime()) / 1000),
  );

  const client = await fastify.pg.connect();
  try {
    await saveTravelHistory(client, {
      userId,
      from: routeResult.from,
      to: routeResult.to,
      routeIds: getRouteIds(routeResult),
      transferCount: routeResult.transferCount,
      bestEffort: routeResult.bestEffort,
      totalDistanceM: getTotalDistanceM(routeResult),
      etaSeconds: actualDurationSeconds,
      graphVersion: String(routeResult.graphVersion ?? "unknown"),
      pathfindingResult: {
        ...routeResult,
        plannedEtaSeconds: routeResult.etaSeconds,
        tripStartedAt: startedAt.toISOString(),
        tripFinishedAt: body.finishedAt ?? safeTraveledAt.toISOString(),
        actualDurationSeconds,
      },
      traveledAt: safeTraveledAt,
    });

    return { message: "Travel history entry saved successfully" };
  } finally {
    client.release();
  }
}

export async function deleteUserTravelHistoryHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
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
}
