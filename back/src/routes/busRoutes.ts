import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import {
  deleteBussesSchema,
  deleteBusSchema,
  getBusSchema,
  getBussesSchema,
} from "../schemas/bus";
import type { LocationDTO } from "../../../types/location";
import type { DeleteBusQuery, GetBusQuery, GetBusesQuery } from "../../../types/bus";
export async function busRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/navigation/route",
    {
      preHandler: [fastify.authenticate],
      schema: navigationRouteSchema,
    },
    async (request, reply) => {
      const { from, to } = request.body as {  
        from:LocationDTO;
        to:LocationDTO ;
      };

      return {
        from,
        to,
        message: "Routing not implemented yet",
      };
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
      try {
        await client.query("DELETE FROM routes WHERE type = $1 ", ["bus"]);
        return {
          message: "Busses deleted successfully",
        };
      } finally {
        client.release();
      }
    }
  );
}
