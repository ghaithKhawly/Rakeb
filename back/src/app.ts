import Fastify from "fastify";
import postgresPlugin from "./plugins/postgres";
import { routes } from "./routes";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

export const app = Fastify({
  logger: false,
});

export async function buildApp() {
  await app.register(postgresPlugin);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Bus Navigation API",
        description: "Backend for bus route discovery",
        version: "0.1.0",
      },
    },
  });
  await app.register(routes);
 
  await app.register(swaggerUI, {
    routePrefix: "/docs",
  });
  return app;
}
