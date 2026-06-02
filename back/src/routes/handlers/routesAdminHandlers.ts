import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { graphCache } from "../../services/graphCache";
import type {
  CreateAdminRouteBody,
  CreateAdminRouteResponse,
  GetBusesQuery,
  GetBusQuery,
  SubmitBusFeedbackBody,
  GetRouteLiveMetricsQuery,
  GetBusFeedbackSummaryQuery,
  DeleteBusQuery,
  DeleteBusesQuery,
  SnapAdminRouteBody,
  SnapAdminRouteResponse,
} from "../../../../types/bus";
import { requireAdminRole } from "../utils/adminAuth";

const MANAGED_TRANSIT_TYPES = ["bus", "microbus"];
const DEFAULT_DRAWN_ROUTE_SPEED_KMH = 25;
const DEFAULT_DRAWN_ROUTE_PRICE = 3000;
const DEFAULT_DRAWN_ROUTE_MAX_ACTIVE_BUSES = 1;
const DRAWN_ROUTE_ACCESS_GAP_M = 400;
const MIN_DISTINCT_ROUTE_POINT_DISTANCE_M = 5;
const ROAD_SNAP_TIMEOUT_MS = 8000;
const ROAD_SNAP_SOURCE = "osrm";

type DrawCoordinate = {
  lat: number;
  lng: number;
};

type RoadSnapResult = {
  coordinates: DrawCoordinate[];
  distanceM: number | null;
  durationSeconds: number | null;
  source: string;
  fallbackReason?: string;
};

function drawnRoadSnapFallback(coordinates: DrawCoordinate[], fallbackReason?: string): RoadSnapResult {
  return {
    coordinates: normalizeDrawnCoordinates(coordinates),
    distanceM: null,
    durationSeconds: null,
    source: "drawn",
    fallbackReason,
  };
}

function haversineDistanceM(a: DrawCoordinate, b: DrawCoordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function interpolateCoordinate(a: DrawCoordinate, b: DrawCoordinate, ratio: number): DrawCoordinate {
  return {
    lat: a.lat + ((b.lat - a.lat) * ratio),
    lng: a.lng + ((b.lng - a.lng) * ratio),
  };
}

function normalizeDrawnCoordinates(coordinates: DrawCoordinate[]): DrawCoordinate[] {
  const normalized: DrawCoordinate[] = [];
  for (const coordinate of coordinates) {
    const last = normalized[normalized.length - 1];
    if (!last || haversineDistanceM(last, coordinate) >= MIN_DISTINCT_ROUTE_POINT_DISTANCE_M) {
      normalized.push(coordinate);
    }
  }
  return normalized;
}

function safeOsrmBaseUrl(): string {
  return (process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
}

async function snapCoordinatesToRoads(coordinates: DrawCoordinate[]): Promise<RoadSnapResult> {
  const normalized = normalizeDrawnCoordinates(coordinates);
  if (normalized.length < 2) {
    return {
      coordinates: normalized,
      distanceM: null,
      durationSeconds: null,
      source: "drawn",
    };
  }

  const coordinatePath = normalized
    .map((coordinate) => `${coordinate.lng},${coordinate.lat}`)
    .join(";");
  const url = `${safeOsrmBaseUrl()}/route/v1/driving/${coordinatePath}?overview=full&geometries=geojson&steps=false&alternatives=false&generate_hints=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROAD_SNAP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "jr-routing-admin/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Road snap failed with HTTP ${response.status}`);
    }

    const payload = await response.json() as {
      code?: string;
      message?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: {
          coordinates?: Array<[number, number]>;
        };
      }>;
    };
    const route = payload.routes?.[0];
    const snappedCoordinates = route?.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) ?? [];

    if (payload.code !== "Ok" || !route || snappedCoordinates.length < 2) {
      throw new Error(payload.message || "Road snap did not return a route.");
    }

    return {
      coordinates: snappedCoordinates,
      distanceM: typeof route.distance === "number" ? route.distance : null,
      durationSeconds: typeof route.duration === "number" ? route.duration : null,
      source: ROAD_SNAP_SOURCE,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function densifyCoordinates(coordinates: DrawCoordinate[]): DrawCoordinate[] {
  const normalized = normalizeDrawnCoordinates(coordinates);
  if (normalized.length < 2) {
    return normalized;
  }

  const densified: DrawCoordinate[] = [normalized[0] as DrawCoordinate];
  for (let index = 1; index < normalized.length; index += 1) {
    const from = normalized[index - 1] as DrawCoordinate;
    const to = normalized[index] as DrawCoordinate;
    const distanceM = haversineDistanceM(from, to);
    const segmentCount = Math.max(1, Math.ceil(distanceM / DRAWN_ROUTE_ACCESS_GAP_M));

    for (let step = 1; step <= segmentCount; step += 1) {
      densified.push(interpolateCoordinate(from, to, step / segmentCount));
    }
  }

  return densified;
}

function lineStringWkt(coordinates: DrawCoordinate[]): string {
  const points = coordinates.map((coordinate) => `${coordinate.lng} ${coordinate.lat}`);
  return `LINESTRING(${points.join(", ")})`;
}

function segmentLineStringWkt(from: DrawCoordinate, to: DrawCoordinate): string {
  return lineStringWkt([from, to]);
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
      WHERE r.type = ANY($2::text[])
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
    [...params, MANAGED_TRANSIT_TYPES],
  );
}

export async function listBussesHandler(fastify: FastifyInstance, request: FastifyRequest) {
  const query = request.query as GetBusesQuery;
  const client = await fastify.pg.connect();
  try {
    const whereClauses: string[] = ["type = ANY($1::text[])"];
    const values: unknown[] = [MANAGED_TRANSIT_TYPES];

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
    return { busses: res.rows };
  } finally {
    client.release();
  }
}

export async function getBusHandler(fastify: FastifyInstance, request: FastifyRequest) {
  const query = request.query as GetBusQuery;
  const client = await fastify.pg.connect();
  try {
    const res = await client.query("SELECT * FROM routes WHERE type = ANY($1::text[]) AND id = $2", [MANAGED_TRANSIT_TYPES, query.id]);
    return { busses: res.rows };
  } finally {
    client.release();
  }
}

export async function createAdminRouteHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const body = request.body as CreateAdminRouteBody;
  const shouldSnapToRoads = body.snapToRoads ?? true;
  let snapResult: RoadSnapResult | null = null;
  let routeShape = body.coordinates;

  if (shouldSnapToRoads) {
    try {
      snapResult = await snapCoordinatesToRoads(body.coordinates);
      routeShape = snapResult.coordinates;
    } catch (error) {
      request.log.warn({ error }, "Road snapping failed; saving drawn route coordinates.");
    }
  }

  const coordinates = densifyCoordinates(routeShape);

  if (coordinates.length < 2) {
    return reply.code(400).send({ error: "Draw at least two distinct route points." });
  }

  const avgSpeedKmh = body.avgSpeedKmh ?? DEFAULT_DRAWN_ROUTE_SPEED_KMH;
  const basePrice = body.basePrice ?? DEFAULT_DRAWN_ROUTE_PRICE;
  const maxActiveBuses = body.maxActiveBuses ?? DEFAULT_DRAWN_ROUTE_MAX_ACTIVE_BUSES;
  const client = await fastify.pg.connect();

  try {
    await client.query("BEGIN");

    const routeRes = await client.query(
      `
      INSERT INTO routes (
        name,
        type,
        avg_speed_kmh,
        base_price,
        frequency_minutes,
        crowding_tendency,
        max_active_buses,
        geom
      )
      VALUES ($1, $2, $3, $4, NULL, 'medium', $5, ST_GeomFromText($6, 4326))
      RETURNING id, name, type, avg_speed_kmh, base_price, frequency_minutes, crowding_tendency, max_active_buses, created_at
      `,
      [
        body.name.trim(),
        body.transportType,
        avgSpeedKmh,
        basePrice,
        maxActiveBuses,
        lineStringWkt(coordinates),
      ],
    );

    const route = routeRes.rows[0];
    const nodeIds: number[] = [];
    for (const coordinate of coordinates) {
      const nodeRes = await client.query<{ id: number }>(
        "INSERT INTO nodes (latitude, longitude) VALUES ($1, $2) RETURNING id",
        [coordinate.lat, coordinate.lng],
      );
      nodeIds.push(nodeRes.rows[0].id);
    }

    for (let index = 0; index < nodeIds.length; index += 1) {
      await client.query(
        `
        INSERT INTO route_nodes (route_id, node_id, sequence_order)
        VALUES ($1, $2, $3)
        `,
        [route.id, nodeIds[index], index],
      );
    }

    let edgesCreated = 0;
    for (let index = 1; index < nodeIds.length; index += 1) {
      const from = coordinates[index - 1] as DrawCoordinate;
      const to = coordinates[index] as DrawCoordinate;
      const distanceM = haversineDistanceM(from, to);
      if (distanceM <= 0) {
        continue;
      }

      const distanceKm = distanceM / 1000;
      const travelTime = (distanceKm / avgSpeedKmh) * 3600;
      const geom = segmentLineStringWkt(from, to);
      const fromNodeId = nodeIds[index - 1];
      const toNodeId = nodeIds[index];

      const forward = await client.query(
        `
        INSERT INTO edges (from_node, to_node, route_id, travel_time, distance_km, geom)
        VALUES ($1, $2, $3, $4, $5, ST_GeomFromText($6, 4326))
        ON CONFLICT (from_node, to_node, route_id) DO NOTHING
        `,
        [fromNodeId, toNodeId, route.id, travelTime, distanceKm, geom],
      );
      edgesCreated += forward.rowCount ?? 0;

      const backward = await client.query(
        `
        INSERT INTO edges (from_node, to_node, route_id, travel_time, distance_km, geom)
        VALUES ($1, $2, $3, $4, $5, ST_GeomFromText($6, 4326))
        ON CONFLICT (from_node, to_node, route_id) DO NOTHING
        `,
        [toNodeId, fromNodeId, route.id, travelTime, distanceKm, geom],
      );
      edgesCreated += backward.rowCount ?? 0;
    }

    await client.query(
      `
      INSERT INTO route_driver_availability (route_id, active_driver_count)
      VALUES ($1, 0)
      ON CONFLICT (route_id) DO NOTHING
      `,
      [route.id],
    );

    await refreshRouteLiveMetrics(client, route.id);
    await client.query("COMMIT");
    graphCache.invalidate();

    return reply.code(201).send({
      message: "Transit route created successfully",
      route,
      graph: {
        nodesCreated: nodeIds.length,
        edgesCreated,
      },
      snap: {
        applied: snapResult != null,
        source: snapResult?.source ?? "drawn",
        distanceM: snapResult?.distanceM ?? null,
        durationSeconds: snapResult?.durationSeconds ?? null,
      },
    } satisfies CreateAdminRouteResponse);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function snapAdminRouteHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const body = request.body as SnapAdminRouteBody;
  try {
    const snapped = await snapCoordinatesToRoads(body.coordinates);
    return reply.code(200).send({
      coordinates: snapped.coordinates,
      distanceM: snapped.distanceM,
      durationSeconds: snapped.durationSeconds,
      source: snapped.source,
      fallbackReason: snapped.fallbackReason,
    } satisfies SnapAdminRouteResponse);
  } catch (error) {
    request.log.warn({ error }, "Road snapping failed; returning drawn route fallback.");
    const fallback = drawnRoadSnapFallback(
      body.coordinates,
      error instanceof Error ? error.message : "Could not snap route to roads.",
    );
    return reply.code(200).send({
      coordinates: fallback.coordinates,
      distanceM: fallback.distanceM,
      durationSeconds: fallback.durationSeconds,
      source: fallback.source,
      fallbackReason: fallback.fallbackReason,
    } satisfies SnapAdminRouteResponse);
  }
}

export async function submitBusFeedbackHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
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
      "SELECT id FROM routes WHERE id = $1 AND type = ANY($2::text[])",
      [body.routeId, MANAGED_TRANSIT_TYPES],
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
}

export async function getBusLiveMetricsHandler(fastify: FastifyInstance, request: FastifyRequest) {
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
      active_driver_count: number;
      max_active_buses: number;
      availability_ratio: number;
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
        COALESCE(a.active_driver_count, 0)::int AS active_driver_count,
        COALESCE(r.max_active_buses, 1)::int AS max_active_buses,
        CASE
          WHEN COALESCE(r.max_active_buses, 1) > 0
            THEN LEAST(1.0, GREATEST(0.0, COALESCE(a.active_driver_count, 0)::float8 / NULLIF(r.max_active_buses, 0)))
          ELSE 0
        END AS availability_ratio,
        m.last_report_at,
        m.updated_at
      FROM route_live_metrics m
      JOIN routes r ON r.id = m.route_id
      LEFT JOIN route_driver_availability a ON a.route_id = m.route_id
      WHERE r.type = ANY($2::text[])
        AND ($1::int IS NULL OR m.route_id = $1::int)
      ORDER BY m.route_id ASC
      `,
      [...params, MANAGED_TRANSIT_TYPES],
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
        activeDriverCount: row.active_driver_count,
        maxActiveBuses: row.max_active_buses,
        availabilityRatio: row.availability_ratio,
        lastReportAt: row.last_report_at,
        updatedAt: row.updated_at,
      })),
    };
  } finally {
    client.release();
  }
}

export async function getBusFeedbackSummaryHandler(fastify: FastifyInstance, request: FastifyRequest) {
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
}

export async function deleteBusHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const client = await fastify.pg.connect();
  const query = request.query as DeleteBusQuery;
  try {
    await client.query("DELETE FROM routes WHERE type = ANY($1::text[]) AND id = $2", [MANAGED_TRANSIT_TYPES, query.id]);
    if (query.invalidateGraph ?? true) {
      graphCache.invalidate();
    }
    return { message: "Transit route deleted successfully" };
  } finally {
    client.release();
  }
}

export async function deleteBussesHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const client = await fastify.pg.connect();
  const query = request.query as DeleteBusesQuery;
  try {
    await client.query("DELETE FROM routes WHERE type = ANY($1::text[]) ", [MANAGED_TRANSIT_TYPES]);
    if (query.invalidateGraph ?? true) {
      graphCache.invalidate();
    }
    return { message: "Transit routes deleted successfully" };
  } finally {
    client.release();
  }
}

export async function increaseBusPricesHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const client = await fastify.pg.connect();
  try {
    await client.query(`UPDATE routes
      SET base_price = base_price * 1.10
      WHERE type = ANY($1::text[]) AND base_price IS NOT NULL`, [MANAGED_TRANSIT_TYPES]);
    return { message: "Transit route prices increased by 10%" };
  } finally {
    client.release();
  }
}
