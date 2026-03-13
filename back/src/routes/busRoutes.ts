import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import {
  deleteBussesSchema,
  deleteBusSchema,
  graphCacheQuerySchema,
  getGraphSchema,
  getBusSchema,
  getBussesSchema,
  invalidateGraphSchema,
} from "../schemas/bus";
import type { LocationDTO } from "../../../types/location";
import type {
  DeleteBusesQuery,
  DeleteBusQuery,
  GetBusQuery,
  GetBusesQuery,
  GetGraphQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
} from "../../../types/bus";
import { graphCache } from "../services/graphCache";
import { routingWorkerClient } from "../services/routingWorkerClient";
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
}
