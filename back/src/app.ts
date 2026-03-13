import Fastify, { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import postgresPlugin from "./plugins/postgres";
import jwtPlugin from "./plugins/jwt";  
import { setupDatabase } from "./db/setup";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { authRoutes } from "./routes/authRoutes";
import { busRoutes } from "./routes/busRoutes";
import { graphCache } from "./services/graphCache";
export const app = Fastify({
  logger: true,
});

export async function buildApp() {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    console.log("errs", error);
    if (error.validation) {
      const validationErrors = error.validation.map(err => ({
        field: err.instancePath.replace('/', ''), 
        message: err.message
      }));
      console.log("valerrs", validationErrors[0].message);
      return reply.status(400).send({
        error: `Validation Error ${validationErrors[0].message}`,
        details: validationErrors[0].message
      });
    }

    reply.send(error);
  });
   await app.register(postgresPlugin);
  
  await app.register(jwtPlugin);
   await setupDatabase(app);

  try {
    await graphCache.warmup(app);
    app.log.info("Graph cache warmed up at startup");
  } catch (error) {
    app.log.error({ error }, "Graph cache warmup failed; it will lazy-load on first request");
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Bus Navigation API",
        description: "Backend for bus route discovery",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    },
  });

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(busRoutes, { prefix: "/api/busses" });
  app.get(
    "/api/protected",
    {
      preHandler: [app.authenticate],
      
      schema: {
        security: [{ bearerAuth: [] }]
      }
    },
    async (request, reply) => {
      
      return { 
        message: "This is a protected route",
        user: request.user 
      };
    }
  );

  
  app.get("/api/public", async (request, reply) => {
    return { 
      message: "This is public - no token needed" 
    };
  });

  await app.register(swaggerUI, {
    routePrefix: "/docs",
  });

  app.get("/health", async () => {
    return { status: "OK", timestamp: new Date().toISOString() };
  });

  return app;
}