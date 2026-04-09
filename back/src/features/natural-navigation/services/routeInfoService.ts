import type { FastifyInstance } from "fastify";

export async function getRouteInfoByNameOrId(
  fastify: FastifyInstance,
  routeName: string,
): Promise<{
  routeId: number;
  routeName: string;
  stops: Array<{ sequence: number; lat: number; lng: number; label: string }>;
} | null> {
  const routeRes = await fastify.pg.query<{ id: number; name: string }>(
    `
    SELECT id, name
    FROM routes
    WHERE LOWER(name) = LOWER($1)
       OR id::text = $1
    LIMIT 1
    `,
    [routeName],
  );

  const route = routeRes.rows[0];
  if (!route) {
    return null;
  }

  const stopsRes = await fastify.pg.query<{
    sequence_order: number;
    latitude: number;
    longitude: number;
  }>(
    `
    SELECT rn.sequence_order, n.latitude, n.longitude
    FROM route_nodes rn
    JOIN nodes n ON n.id = rn.node_id
    WHERE rn.route_id = $1
    ORDER BY rn.sequence_order ASC
    `,
    [route.id],
  );

  return {
    routeId: route.id,
    routeName: route.name,
    stops: stopsRes.rows.map((row: {
      sequence_order: number;
      latitude: number;
      longitude: number;
    }) => ({
      sequence: row.sequence_order,
      lat: row.latitude,
      lng: row.longitude,
      label: `Stop ${row.sequence_order}`,
    })),
  };
}
