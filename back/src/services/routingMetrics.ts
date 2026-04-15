import type { RouteLiveMetricForRouting } from "../../../types/navigation";

type Queryable = {
  query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type RoutingMetricRow = {
  route_id: number;
  effective_price: number | null;
  effective_speed_score: number | null;
  effective_crowding_score: number | null;
  effective_slowness_multiplier: number | null;
  active_driver_count: number | null;
  max_active_buses: number | null;
  availability_ratio: number | null;
};

const failOpenWhenNoActiveDrivers =
  process.env.ROUTING_AVAILABILITY_FAIL_OPEN === "1"
  || (process.env.ROUTING_AVAILABILITY_FAIL_OPEN == null && process.env.NODE_ENV !== "production");

export type RouteAvailabilityRow = {
  route_id: number;
  active_driver_count: number;
  max_active_buses: number;
  availability_ratio: number;
  availability_updated_at: string | null;
};

function mapRoutingMetricRow(
  row: RoutingMetricRow,
  forceNeutralAvailability: boolean,
): RouteLiveMetricForRouting {
  return {
    routeId: row.route_id,
    effectivePrice: row.effective_price,
    effectiveSpeedScore: row.effective_speed_score,
    effectiveCrowdingScore: row.effective_crowding_score,
    effectiveSlownessMultiplier: row.effective_slowness_multiplier,
    activeDriverCount: row.active_driver_count ?? 0,
    maxActiveBuses: Math.max(1, row.max_active_buses ?? 1),
    availabilityRatio: forceNeutralAvailability
      ? 1
      : Math.min(1, Math.max(0, row.availability_ratio ?? 0)),
  };
}

export async function loadRouteMetrics(
  source: Queryable,
  routeId?: number,
): Promise<RouteLiveMetricForRouting[]> {
  const params: Array<number | null> = [routeId ?? null];
  const metricsRes = await source.query<RoutingMetricRow>(`
    SELECT
      r.id AS route_id,
      m.effective_price,
      m.effective_speed_score,
      m.effective_crowding_score,
      m.effective_slowness_multiplier,
      COALESCE(a.active_driver_count, 0)::int AS active_driver_count,
      COALESCE(r.max_active_buses, 1)::int AS max_active_buses,
      CASE
        WHEN COALESCE(r.max_active_buses, 1) > 0
          THEN LEAST(1.0, GREATEST(0.0, COALESCE(a.active_driver_count, 0)::float8 / NULLIF(r.max_active_buses, 0)))
        ELSE 0
      END AS availability_ratio
    FROM routes r
    LEFT JOIN route_live_metrics m ON m.route_id = r.id
    LEFT JOIN route_driver_availability a ON a.route_id = r.id
    WHERE r.type = 'bus'
      AND ($1::int IS NULL OR r.id = $1::int)
    ORDER BY r.id ASC
  `, params);

  const totalActiveDrivers = metricsRes.rows.reduce(
    (sum, row) => sum + Math.max(0, row.active_driver_count ?? 0),
    0,
  );
  const forceNeutralAvailability = failOpenWhenNoActiveDrivers && totalActiveDrivers === 0;

  return metricsRes.rows.map((row) => mapRoutingMetricRow(row, forceNeutralAvailability));
}

export async function loadRouteAvailability(
  source: Queryable,
  routeId?: number,
): Promise<RouteAvailabilityRow[]> {
  const params: Array<number | null> = [routeId ?? null];
  const result = await source.query<RouteAvailabilityRow>(`
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

  return result.rows;
}