import { FastifyInstance } from "fastify";
import { loginSchema, changeUserRole, registerSchema } from "../schemas/auth";
import {
  registerHandler,
  loginHandler,
  promoteDriverHandler,
  demoteDriverHandler,
} from "./handlers/authHandlers";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/register",
    { schema: registerSchema },
    async (request, reply) => registerHandler(fastify, request, reply),
  );
  fastify.post("/login", { schema: loginSchema }, async (request, reply) => {
    return loginHandler(fastify, request, reply);
  });
  fastify.post(
    "/admin/users/promote-driver",
    {
      preHandler: [fastify.authenticate],
      schema: changeUserRole,
    },
    async (request, reply) => promoteDriverHandler(fastify, request, reply),
  );
  fastify.post(
    "/admin/users/demote-driver",
    {
      preHandler: [fastify.authenticate],
      schema: changeUserRole,
    },
    async (request, reply) => demoteDriverHandler(fastify, request, reply),
  );
}
