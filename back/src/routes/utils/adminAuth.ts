import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export async function requireAdminRole(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<number | null> {
  const userPayload = request.user as { id?: number | string } | undefined;
  const userId = Number(userPayload?.id);

  if (!Number.isFinite(userId)) {
    reply.code(401).send({ error: "Unauthorized user payload" });
    return null;
  }

  const client = await fastify.pg.connect();
  try {
    const result = await client.query<{ role: string | null }>(
      "SELECT role FROM users WHERE id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      reply.code(401).send({ error: "Unauthorized user payload" });
      return null;
    }

    if (result.rows[0].role !== "admin") {
      reply.code(403).send({ error: "Admin role required" });
      return null;
    }

    return userId;
  } finally {
    client.release();
  }
}

