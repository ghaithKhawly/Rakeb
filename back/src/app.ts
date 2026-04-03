import Fastify, { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import postgresPlugin from "./plugins/postgres";
import jwtPlugin from "./plugins/jwt";
import { setupDatabase } from "./db/setup";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/authRoutes";
import { busRoutes } from "./routes/busRoutes";
import { graphCache } from "./services/graphCache";
export const app = Fastify({
  logger: true,
});

export async function buildApp() {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      console.log("errs", error);
      if (error.validation) {
        const validationContext =
          (error as FastifyError & { validationContext?: string })
            .validationContext ?? "body";
        const validationErrors = error.validation.map((err) => {
          const path = err.instancePath
            ? `${validationContext}.${err.instancePath.replace(/^\//, "").split("/").join(".")}`
            : validationContext;

          return {
            field: path,
            message: err.message ?? "Invalid value",
          };
        });

        const firstError = validationErrors[0];
        console.log("valerrs", firstError);
        return reply.status(400).send({
          error: `Validation Error at ${firstError.field}: ${firstError.message}`,
          details: validationErrors,
        });
      }

      reply.send(error);
    },
  );
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(postgresPlugin);

  await app.register(jwtPlugin);
  await setupDatabase(app);

  try {
    await graphCache.warmup(app);
    app.log.info("Graph cache warmed up at startup");
  } catch (error) {
    app.log.error(
      { error },
      "Graph cache warmup failed; it will lazy-load on first request",
    );
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
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(busRoutes, { prefix: "/api/busses" });
  app.get(
    "/api/protected",
    {
      preHandler: [app.authenticate],

      schema: {
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      return {
        message: "This is a protected route",
        user: request.user,
      };
    },
  );

  app.get("/api/public", async (request, reply) => {
    return {
      message: "This is public - no token needed",
    };
  });

  app.get("/quick-test", async (request, reply) => {
    const isEnabled =
      process.env.ENABLE_DEV_QUICK_TEST_ROUTES === "1" || process.env.NODE_ENV !== "production";

    if (!isEnabled) {
      return reply.code(404).send({ error: "Quick test UI is disabled in production" });
    }

    reply.type("text/html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Routing Quick Test</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 24px; background: #f6f8fa; color: #111827; }
    h1 { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px; max-width: 860px; }
    .full { grid-column: 1 / -1; }
    label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
    input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
    button { margin-top: 12px; padding: 10px 14px; border: 0; border-radius: 8px; background: #0f766e; color: white; cursor: pointer; }
    pre { margin-top: 12px; padding: 12px; background: #0b1020; color: #dbeafe; border-radius: 10px; max-width: 860px; overflow: auto; }
    .hint { margin: 8px 0 12px; color: #475569; }
  </style>
</head>
<body>
  <h1>Routing Quick Test</h1>
  <div class="hint">No token required. This page calls <code>/api/busses/navigation/quick-route</code>.</div>

  <div class="grid">
    <div><label>From Lat</label><input id="fromLat" type="number" step="any" value="33.5138" /></div>
    <div><label>From Lng</label><input id="fromLng" type="number" step="any" value="36.2765" /></div>
    <div><label>To Lat</label><input id="toLat" type="number" step="any" value="33.5175" /></div>
    <div><label>To Lng</label><input id="toLng" type="number" step="any" value="36.2862" /></div>

    <div><label>Max Walk (m)</label><input id="maxWalk" type="number" value="80" /></div>
    <div><label>Max Walking Neighbors</label><input id="neighbors" type="number" value="100" /></div>
    <div><label>Walking Speed (m/s)</label><input id="walkSpeed" type="number" step="any" value="0.4" /></div>
    <div><label>Max Transfers</label><input id="maxTransfers" type="number" value="5" /></div>

    <div><label>Weight: Speed</label><input id="wSpeed" type="number" step="any" value="0" /></div>
    <div><label>Weight: Crowding</label><input id="wCrowding" type="number" step="any" value="0" /></div>
    <div><label>Weight: Price</label><input id="wPrice" type="number" step="any" value="0" /></div>
    <div><label>Weight: Transfer</label><input id="wTransfer" type="number" step="any" value="0" /></div>
    <div class="full"><label>Weight: Walking</label><input id="wWalking" type="number" step="any" value="0" /></div>
  </div>

  <button id="runBtn">Run Route</button>
  <pre id="out">Ready.</pre>

  <script>
    const readNum = (id) => Number(document.getElementById(id).value);
    const out = document.getElementById('out');
    document.getElementById('runBtn').addEventListener('click', async () => {
      const payload = {
        from: { lat: readNum('fromLat'), lng: readNum('fromLng'), label: 'Start Manual' },
        to: { lat: readNum('toLat'), lng: readNum('toLng'), label: 'End Manual' },
        preferences: {
          speed: readNum('wSpeed'),
          crowding: readNum('wCrowding'),
          price: readNum('wPrice'),
          transfer: readNum('wTransfer'),
          walking: readNum('wWalking')
        },
        options: {
          maxWalkingDistanceM: readNum('maxWalk'),
          maxWalkingNeighbors: readNum('neighbors'),
          walkingSpeedMps: readNum('walkSpeed'),
          maxBusTransfers: readNum('maxTransfers')
        }
      };

      out.textContent = 'Loading...';
      try {
        const res = await fetch('/api/busses/navigation/quick-route', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        out.textContent = JSON.stringify({ status: res.status, body: parsed }, null, 2);
      } catch (err) {
        out.textContent = String(err);
      }
    });
  </script>
</body>
</html>`);
  });

  await app.register(swaggerUI, {
    routePrefix: "/docs",
  });

  app.get("/health", async () => {
    return { status: "OK", timestamp: new Date().toISOString() };
  });

  return app;
}
