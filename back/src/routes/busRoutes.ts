import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import {
  deleteBussesSchema,
  deleteBusSchema,
  graphCacheQuerySchema,
  getBusFeedbackSummarySchema,
  getRouteLiveMetricsSchema,
  getGraphSchema,
  getBusSchema,
  getBussesSchema,
  invalidateGraphSchema,
  submitBusFeedbackSchema,
} from "../schemas/bus";
import type { LocationDTO } from "../../../types/location";
import type {
  DeleteBusesQuery,
  DeleteBusQuery,
  GetBusFeedbackSummaryQuery,
  GetBusQuery,
  GetBusesQuery,
  GetGraphQuery,
  GetRouteLiveMetricsQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
  SubmitBusFeedbackBody,
} from "../../../types/bus";
import { graphCache } from "../services/graphCache";
import { routingWorkerClient } from "../services/routingWorkerClient";

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
      avg_slowness_level,
      effective_price,
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
      b.avg_slowness_level,
      b.avg_reported_price AS effective_price,
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
          avg_slowness_level = EXCLUDED.avg_slowness_level,
          effective_price = EXCLUDED.effective_price,
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
  fastify.post(
    "/navigation/route",
    {
      preHandler: [fastify.authenticate],
      schema: navigationRouteSchema,
    },
    async (request, reply) => {
      const snapshot = await graphCache.getSnapshot(fastify);
      const { from, to } = request.body as {  
        from:LocationDTO;
        to:LocationDTO ;
      };

      return routingWorkerClient.route({
        from,
        to,
        graphLoadedAt: snapshot.loadedAt,
      });
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
        || typeof body.slownessLevel === "number"
        || (typeof body.comment === "string" && body.comment.trim().length > 0);

      if (!hasAnyMetric) {
        return reply.code(400).send({
          error: "At least one feedback value is required (price, crowding, slowness, or comment)",
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
            (route_id, user_id, reported_price, crowding_level, slowness_level, comment)
          VALUES
            ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (route_id, user_id)
          DO UPDATE SET
            reported_price = COALESCE(EXCLUDED.reported_price, bus_feedback_reports.reported_price),
            crowding_level = COALESCE(EXCLUDED.crowding_level, bus_feedback_reports.crowding_level),
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
          avg_slowness_level: number | null;
          effective_price: number | null;
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
            m.avg_slowness_level,
            m.effective_price,
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
            avgSlownessLevel: row.avg_slowness_level,
            effectivePrice: row.effective_price,
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
