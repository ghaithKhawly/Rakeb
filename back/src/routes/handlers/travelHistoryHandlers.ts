import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  DeleteUserTravelHistoryQuery,
  GetUserTravelHistoryQuery,
} from "../../../../types/bus";

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
      "SELECT COUNT(*)::int AS total FROM travel_history WHERE user_id = $1",
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