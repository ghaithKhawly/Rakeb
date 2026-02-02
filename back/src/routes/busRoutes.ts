import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import type {LocationDTO} from "../../../types/location"
export async function busRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/navigation/route",
    {
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
}
