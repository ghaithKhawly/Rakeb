import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  DriverCheckInBody,
  DriverCheckInResponse,
  DriverCheckOutBody,
  DriverCheckOutResponse,
  RouteAvailabilityResponse,
} from "../../../../types/bus";
import {
  getAuthenticatedUserId,
  mapDriverSessionRow,
  mapRouteAvailabilityRow,
  DriverSessionRow,
  RouteAvailabilityDbRow,
} from "../utils/busUtils";
import { readCurrentAvailability, requireDriverRole } from "./busHandlers";

export async function checkInDriverHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = getAuthenticatedUserId(request);
  if (userId == null) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  const body = request.body as DriverCheckInBody;
  const client = await fastify.pg.connect();
  try {
    await client.query("BEGIN");

    const role = await requireDriverRole(client, userId);
    if (role == null) {
      await client.query("ROLLBACK");
      return reply.code(401).send({ error: "Unauthorized user payload" });
    }

    if (role !== "driver" && role !== "admin") {
      await client.query("ROLLBACK");
      return reply.code(403).send({ error: "Driver role required" });
    }

    const routeRes = await client.query<{ id: number; max_active_buses: number }>(
      "SELECT id, max_active_buses FROM routes WHERE id = $1 AND type IN ('bus', 'microbus')",
      [body.routeId],
    );

    if (routeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "Bus route not found" });
    }

    const route = routeRes.rows[0];

    const activeSessionRes = await client.query<DriverSessionRow>(
      `
      SELECT id, user_id, route_id, checked_in_at, checked_out_at
      FROM driver_sessions
      WHERE user_id = $1 AND checked_out_at IS NULL
      FOR UPDATE
      `,
      [userId],
    );

    if (activeSessionRes.rows.length > 0) {
      const activeSession = activeSessionRes.rows[0];
      if (activeSession.route_id === body.routeId) {
        await client.query("COMMIT");
        const availability = await readCurrentAvailability(fastify.pg, body.routeId);
        return reply.code(200).send({
          message: "Driver already checked in on this route",
          session: mapDriverSessionRow(activeSession),
          availability: availability[0] ?? {
            routeId: body.routeId,
            activeDriverCount: 0,
            maxActiveBuses: route.max_active_buses,
            availabilityRatio: 0,
            updatedAt: null,
          },
        } satisfies DriverCheckInResponse);
      }

      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "Driver already checked into another route" });
    }

    await client.query(
      `
      INSERT INTO route_driver_availability (route_id, active_driver_count)
      VALUES ($1, 0)
      ON CONFLICT (route_id) DO NOTHING
      `,
      [body.routeId],
    );

    const availabilityRes = await client.query<RouteAvailabilityDbRow>(
      `
      SELECT
        r.id AS route_id,
        a.active_driver_count::int AS active_driver_count,
        COALESCE(r.max_active_buses, 1)::int AS max_active_buses,
        CASE
          WHEN COALESCE(r.max_active_buses, 1) > 0
            THEN LEAST(1.0, GREATEST(0.0, a.active_driver_count::float8 / NULLIF(r.max_active_buses, 0)))
          ELSE 0
        END AS availability_ratio,
        a.updated_at AS availability_updated_at
      FROM routes r
      JOIN route_driver_availability a ON a.route_id = r.id
      WHERE r.id = $1
      FOR UPDATE OF r, a
      `,
      [body.routeId],
    );

    if (availabilityRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "Bus route not found" });
    }

    const availabilityRow = availabilityRes.rows[0];
    if (availabilityRow.active_driver_count >= route.max_active_buses) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "No available bus slots on this route" });
    }

    const insertRes = await client.query<DriverSessionRow>(
      `
      INSERT INTO driver_sessions (user_id, route_id)
      VALUES ($1, $2)
      RETURNING id, user_id, route_id, checked_in_at, checked_out_at
      `,
      [userId, body.routeId],
    );

    await client.query(
      `
      UPDATE route_driver_availability
      SET active_driver_count = active_driver_count + 1,
          updated_at = NOW()
      WHERE route_id = $1
      `,
      [body.routeId],
    );

    await client.query("COMMIT");

    const availability = await readCurrentAvailability(fastify.pg, body.routeId);
    return reply.code(200).send({
      message: "Driver checked in successfully",
      session: mapDriverSessionRow(insertRes.rows[0]),
      availability: availability[0] ?? {
        routeId: body.routeId,
        activeDriverCount: 0,
        maxActiveBuses: route.max_active_buses,
        availabilityRatio: 0,
        updatedAt: null,
      },
    } satisfies DriverCheckInResponse);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkOutDriverHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = getAuthenticatedUserId(request);
  if (userId == null) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  const body = request.body as DriverCheckOutBody;
  const client = await fastify.pg.connect();
  try {
    await client.query("BEGIN");

    const role = await requireDriverRole(client, userId);
    if (role == null) {
      await client.query("ROLLBACK");
      return reply.code(401).send({ error: "Unauthorized user payload" });
    }

    if (role !== "driver" && role !== "admin") {
      await client.query("ROLLBACK");
      return reply.code(403).send({ error: "Driver role required" });
    }

    const activeSessionRes = await client.query<DriverSessionRow>(
      `
      SELECT id, user_id, route_id, checked_in_at, checked_out_at
      FROM driver_sessions
      WHERE user_id = $1 AND checked_out_at IS NULL
      FOR UPDATE
      `,
      [userId],
    );

    if (activeSessionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "No active driver session found" });
    }

    const activeSession = activeSessionRes.rows[0];
    if (body.routeId != null && activeSession.route_id !== body.routeId) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "Active driver session does not match the provided route" });
    }

    const checkedOutAt = new Date().toISOString();
    const updateRes = await client.query<DriverSessionRow>(
      `
      UPDATE driver_sessions
      SET checked_out_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, user_id, route_id, checked_in_at, checked_out_at
      `,
      [activeSession.id],
    );

    await client.query(
      `
      INSERT INTO route_driver_availability (route_id, active_driver_count)
      VALUES ($1, 0)
      ON CONFLICT (route_id) DO NOTHING
      `,
      [activeSession.route_id],
    );

    await client.query(
      `
      UPDATE route_driver_availability
      SET active_driver_count = GREATEST(active_driver_count - 1, 0),
          updated_at = NOW()
      WHERE route_id = $1
      `,
      [activeSession.route_id],
    );

    await client.query("COMMIT");

    const availability = await readCurrentAvailability(fastify.pg, activeSession.route_id);
    return reply.code(200).send({
      message: "Driver checked out successfully",
      session: {
        ...mapDriverSessionRow(updateRes.rows[0]),
        checkedOutAt,
      },
      availability: availability[0] ?? {
        routeId: activeSession.route_id,
        activeDriverCount: 0,
        maxActiveBuses: 1,
        availabilityRatio: 0,
        updatedAt: null,
      },
    } satisfies DriverCheckOutResponse);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getDriverAvailabilityHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const query = request.query as { routeId?: number };
  const availability = await readCurrentAvailability(fastify.pg, query.routeId);
  return {
    availability,
  } satisfies RouteAvailabilityResponse;
}
