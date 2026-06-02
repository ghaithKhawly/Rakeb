import { FastifyInstance } from "fastify";
import { navigationRouteSchema } from "../schemas/navigation";
import {
  deleteUserTravelHistorySchema,
  deleteBussesSchema,
  deleteBusSchema,
  driverCheckInSchema,
  driverCheckOutSchema,
  graphCacheQuerySchema,
  getBusFeedbackSummarySchema,
  getRoutingPreferencesSchema,
  getRouteLiveMetricsSchema,
  getRouteAvailabilitySchema,
  getUserTravelHistorySchema,
  getGraphSchema,
  getBusSchema,
  getBussesSchema,
  invalidateGraphSchema,
  createAdminRouteSchema,
  snapAdminRouteSchema,
  saveUserTravelHistorySchema,
  setRoutingPreferencesSchema,
  submitBusFeedbackSchema,
} from "../schemas/bus";
import { checkInDriverHandler, checkOutDriverHandler, getDriverAvailabilityHandler } from "./handlers/driverHandlers";
import {
  listUserTravelHistoryHandler,
  deleteUserTravelHistoryHandler,
  saveUserTravelHistoryHandler,
} from "./handlers/travelHistoryHandlers";
import {
  listBussesHandler,
  getBusHandler,
  submitBusFeedbackHandler,
  getBusLiveMetricsHandler,
  getBusFeedbackSummaryHandler,
  createAdminRouteHandler,
  snapAdminRouteHandler,
  deleteBusHandler,
  deleteBussesHandler,
  increaseBusPricesHandler,
} from "./handlers/routesAdminHandlers";
import {
  getGraphCacheHandler,
  getGraphHandler,
  getRoutingPreferencesHandler,
  invalidateGraphCacheHandler,
  navigationRouteHandler,
  quickNavigationRouteHandler,
} from "./handlers/navigationHandlers";
import { saveRoutingPreferences } from "./handlers/busHandlers";

export async function busRoutes(fastify: FastifyInstance) {
  const enableQuickTestRoutes =
    process.env.ENABLE_DEV_QUICK_TEST_ROUTES === "1" || process.env.NODE_ENV !== "production";

  fastify.post(
    "/navigation/route",
    {
      preHandler: [fastify.authenticate],
      schema: navigationRouteSchema,
    },
    async (request, reply) => navigationRouteHandler(fastify, request, reply),
  );

  if (enableQuickTestRoutes) {
    fastify.post(
      "/navigation/quick-route",
      {
        schema: navigationRouteSchema,
      },
      async (request, reply) => quickNavigationRouteHandler(fastify, request, reply),
    );
  }

  fastify.get(
    "/navigation/preferences",
    {
      preHandler: [fastify.authenticate],
      schema: getRoutingPreferencesSchema,
    },
    async (request, reply) => getRoutingPreferencesHandler(fastify, request, reply),
  );

  fastify.post(
    "/navigation/preferences",
    {
      preHandler: [fastify.authenticate],
      schema: setRoutingPreferencesSchema,
    },
    async (request, reply) => saveRoutingPreferences(fastify, request, reply),
  );

  fastify.put(
    "/navigation/preferences",
    {
      preHandler: [fastify.authenticate],
      schema: setRoutingPreferencesSchema,
    },
    async (request, reply) => saveRoutingPreferences(fastify, request, reply),
  );

  fastify.post(
    "/bus/driver/check-in",
    {
      preHandler: [fastify.authenticate],
      schema: driverCheckInSchema,
    },
    async (request, reply) => checkInDriverHandler(fastify, request, reply),
  );

  fastify.post(
    "/bus/driver/check-out",
    {
      preHandler: [fastify.authenticate],
      schema: driverCheckOutSchema,
    },
    async (request, reply) => checkOutDriverHandler(fastify, request, reply),
  );

  fastify.get(
    "/bus/driver/availability",
    {
      preHandler: [fastify.authenticate],
      schema: getRouteAvailabilitySchema,
    },
    async (request) => getDriverAvailabilityHandler(fastify, request),
  );

  fastify.get(
    "/navigation/history",
    {
      preHandler: [fastify.authenticate],
      schema: getUserTravelHistorySchema,
    },
    async (request, reply) => listUserTravelHistoryHandler(fastify, request, reply),
  );

  fastify.post(
    "/navigation/history",
    {
      preHandler: [fastify.authenticate],
      schema: saveUserTravelHistorySchema,
    },
    async (request, reply) => saveUserTravelHistoryHandler(fastify, request, reply),
  );

  fastify.delete(
    "/navigation/history",
    {
      preHandler: [fastify.authenticate],
      schema: deleteUserTravelHistorySchema,
    },
    async (request, reply) => deleteUserTravelHistoryHandler(fastify, request, reply),
  );

  fastify.get(
    "/graph/cache",
    {
      preHandler: [fastify.authenticate],
      schema: graphCacheQuerySchema,
    },
    async (request) => getGraphCacheHandler(fastify, request),
  );

  fastify.post(
    "/graph/invalidate",
    {
      preHandler: [fastify.authenticate],
      schema: invalidateGraphSchema,
    },
    async (request, reply) => invalidateGraphCacheHandler(fastify, request, reply),
  );

  fastify.get(
    "/graph",
    {
      preHandler: [fastify.authenticate],
      schema: getGraphSchema,
    },
    async (request, reply) => getGraphHandler(fastify, request, reply),
  );

  fastify.get(
    "/busses",
    {
      preHandler: [fastify.authenticate],
      schema: getBussesSchema,
    },
    async (request, reply) => listBussesHandler(fastify, request),
  );

  fastify.post(
    "/admin/routes/snap",
    {
      preHandler: [fastify.authenticate],
      schema: snapAdminRouteSchema,
    },
    async (request, reply) => snapAdminRouteHandler(fastify, request, reply),
  );

  fastify.post(
    "/admin/routes",
    {
      preHandler: [fastify.authenticate],
      schema: createAdminRouteSchema,
    },
    async (request, reply) => createAdminRouteHandler(fastify, request, reply),
  );

  fastify.get(
    "/bus",
    {
      preHandler: [fastify.authenticate],
      schema: getBusSchema,
    },
    async (request, reply) => getBusHandler(fastify, request),
  );

  fastify.post(
    "/bus/feedback",
    {
      preHandler: [fastify.authenticate],
      schema: submitBusFeedbackSchema,
    },
    async (request, reply) => submitBusFeedbackHandler(fastify, request, reply),
  );

  fastify.get(
    "/bus/live-metrics",
    {
      preHandler: [fastify.authenticate],
      schema: getRouteLiveMetricsSchema,
    },
    async (request) => getBusLiveMetricsHandler(fastify, request),
  );

  fastify.get(
    "/bus/feedback/summary",
    {
      preHandler: [fastify.authenticate],
      schema: getBusFeedbackSummarySchema,
    },
    async (request, reply) => getBusFeedbackSummaryHandler(fastify, request),
  );

  fastify.delete(
    "/bus",
    {
      preHandler: [fastify.authenticate],
      schema: deleteBusSchema,
    },
    async (request, reply) => deleteBusHandler(fastify, request, reply),
  );

  fastify.delete(
    "/busses",
    {
      preHandler: [fastify.authenticate],
      schema: deleteBussesSchema,
    },
    async (request, reply) => deleteBussesHandler(fastify, request, reply),
  );

  fastify.post(
    "/busses/price",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => increaseBusPricesHandler(fastify, request, reply),
  );
}

export default { busRoutes };
