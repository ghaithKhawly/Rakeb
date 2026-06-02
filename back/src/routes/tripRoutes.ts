import type { FastifyInstance } from "fastify";
import { resolveTripSchema } from "../schemas/navigation";
import { resolveTripHandler } from "./handlers/nlpHandlers";

export async function tripRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/resolve",
    {
      preHandler: [fastify.authenticate],
      schema: resolveTripSchema,
    },
    async (request, reply) => resolveTripHandler(fastify, request, reply),
  );
}

export default { tripRoutes };
