import fp from "fastify-plugin";
import fastifyJWT from "@fastify/jwt";
import { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: {
      id: string;
      username: string;
    };
  }
}

export default fp(async (fastify) => {
  await fastify.register(fastifyJWT, {
    secret: process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this",
    sign: {
      expiresIn: "7d",
    },
  });

  fastify.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });
});