export const busRouteSchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    type: { type: "string" },
    avg_speed_kmh: { type: ["number", "null"] },
    base_price: { type: ["number", "null"] },
    frequency_minutes: { type: ["number", "null"] },
    crowding_tendency: { type: ["string", "null"] },
    max_active_buses: { type: ["integer", "null"] },
    created_at: { type: ["string", "null"] },
  },
};

export const routeAvailabilitySchema = {
  type: "object",
  properties: {
    routeId: { type: "integer" },
    activeDriverCount: { type: "integer" },
    maxActiveBuses: { type: "integer" },
    availabilityRatio: { type: "number" },
    updatedAt: { type: ["string", "null"] },
  },
};

export const driverSessionSchema = {
  type: "object",
  properties: {
    sessionId: { type: "integer" },
    userId: { type: "integer" },
    routeId: { type: "integer" },
    checkedInAt: { type: "string" },
    checkedOutAt: { type: ["string", "null"] },
  },
};

export const getBussesSchema = {
  tags: ["Bus"],
  summary: "List bus routes",
  operationId: "getBusRoutes",
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      crowdingTendency: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      minSpeedKmh: { type: "number", minimum: 0 },
      maxSpeedKmh: { type: "number", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        busses: {
          type: "array",
          items: busRouteSchema,
        },
      },
    },
  },
};

export const getBusSchema = {
  tags: ["Bus"],
  summary: "Get bus route by id",
  operationId: "getBusRouteById",
  querystring: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        busses: {
          type: "array",
          items: busRouteSchema,
        },
      },
    },
  },
};

export const deleteBussesSchema = {
  tags: ["Bus"],
  summary: "Delete all bus routes",
  operationId: "deleteAllBusRoutes",
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      invalidateGraph: { type: "boolean", default: true },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
  },
};

export const deleteBusSchema = {
  tags: ["Bus"],
  summary: "Delete bus route by id",
  operationId: "deleteBusRouteById",
  querystring: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer", minimum: 1 },
      invalidateGraph: { type: "boolean", default: true },
    },
  },
    response:{
    200: {
      type: "object",
      properties: {message: { type: "string" }},
    },}
};

export const graphCacheQuerySchema = {
  tags: ["Graph"],
  summary: "Get graph cache status",
  operationId: "getGraphCacheStatus",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      forceRefresh: { type: "boolean", default: false },
    },
  },
};

export const getGraphSchema = {
  tags: ["Graph"],
  summary: "Get graph snapshot",
  operationId: "getGraphSnapshot",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      forceRefresh: { type: "boolean", default: false },
      includeRoutes: { type: "boolean", default: true },
      includeNodes: { type: "boolean", default: true },
      includeEdges: { type: "boolean", default: true },
      includeRouteNodes: { type: "boolean", default: true },
    },
  },
};

export const invalidateGraphSchema = {
  tags: ["Graph"],
  summary: "Invalidate graph cache and optionally rebuild",
  operationId: "invalidateGraphCache",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      rebuild: { type: "boolean", default: true },
      wait: { type: "boolean", default: false },
    },
  },
  response: {
    202: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
  },
};

export const submitBusFeedbackSchema = {
  tags: ["Bus Feedback"],
  summary: "Submit or update route feedback",
  operationId: "submitBusFeedback",
  body: {
    type: "object",
    required: ["routeId"],
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
      reportedPrice: { type: "number", minimum: 0 },
      crowdingLevel: { type: "integer", minimum: 1, maximum: 5 },
      speedLevel: { type: "integer", minimum: 1, maximum: 5 },
      slownessLevel: { type: "integer", minimum: 1, maximum: 5 },
      comment: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        reportId: { type: "integer" },
      },
    },
    201: {
      type: "object",
      properties: {
        message: { type: "string" },
        reportId: { type: "integer" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    404: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export const getBusFeedbackSummarySchema = {
  tags: ["Bus Feedback"],
  summary: "Get feedback summary for a route",
  operationId: "getBusFeedbackSummary",
  querystring: {
    type: "object",
    required: ["routeId"],
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
      days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        routeId: { type: "integer" },
        windowDays: { type: "integer" },
        reportsCount: { type: "integer" },
        avgPrice: { type: ["number", "null"] },
        avgCrowdingLevel: { type: ["number", "null"] },
        avgSpeedLevel: { type: ["number", "null"] },
        avgSlownessLevel: { type: ["number", "null"] },
        crowdingTendency: { type: ["string", "null"] },
        speedMultiplierSuggestion: { type: ["number", "null"] },
        lastReportAt: { type: ["string", "null"] },
      },
    },
  },
};

export const getRouteLiveMetricsSchema = {
  tags: ["Bus Feedback"],
  summary: "Get routing live metrics",
  operationId: "getRouteLiveMetrics",
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
      refresh: { type: "boolean", default: true },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              routeId: { type: "integer" },
              reportsCount: { type: "integer" },
              confidenceScore: { type: "number" },
              avgReportedPrice: { type: ["number", "null"] },
              avgCrowdingLevel: { type: ["number", "null"] },
              avgSpeedLevel: { type: ["number", "null"] },
              avgSlownessLevel: { type: ["number", "null"] },
              effectivePrice: { type: ["number", "null"] },
              effectiveSpeedScore: { type: ["number", "null"] },
              effectiveCrowdingScore: { type: ["number", "null"] },
              effectiveSlownessMultiplier: { type: "number" },
              suggestedAvgSpeedKmh: { type: ["number", "null"] },
              activeDriverCount: { type: "integer" },
              maxActiveBuses: { type: "integer" },
              availabilityRatio: { type: "number" },
              lastReportAt: { type: ["string", "null"] },
              updatedAt: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

export const driverCheckInSchema = {
  tags: ["Bus Driver"],
  summary: "Check a driver into a bus route",
  operationId: "driverCheckIn",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["routeId"],
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        session: driverSessionSchema,
        availability: routeAvailabilitySchema,
      },
    },
    401: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    403: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    404: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    409: {
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
};

export const driverCheckOutSchema = {
  tags: ["Bus Driver"],
  summary: "Check a driver out of a bus route",
  operationId: "driverCheckOut",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        session: driverSessionSchema,
        availability: routeAvailabilitySchema,
      },
    },
    401: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    403: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    404: {
      type: "object",
      properties: { error: { type: "string" } },
    },
    409: {
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
};

export const getRouteAvailabilitySchema = {
  tags: ["Bus Driver"],
  summary: "Get current driver availability for bus routes",
  operationId: "getRouteAvailability",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      routeId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        availability: {
          type: "array",
          items: routeAvailabilitySchema,
        },
      },
    },
    401: {
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
};

export const getUserTravelHistorySchema = {
  tags: ["Navigation"],
  summary: "Get current user travel history",
  operationId: "getUserTravelHistory",
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        limit: { type: "integer" },
        offset: { type: "integer" },
        total: { type: "integer" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              originLat: { type: "number" },
              originLng: { type: "number" },
              destLat: { type: "number" },
              destLng: { type: "number" },
              originLabel: { type: ["string", "null"] },
              destLabel: { type: ["string", "null"] },
              routeIds: {
                type: ["array", "null"],
                items: { type: "integer" },
              },
              transferCount: { type: ["integer", "null"] },
              totalDistanceM: { type: ["number", "null"] },
              totalDurationSeconds: { type: ["number", "null"] },
              dayOfWeek: { type: "integer" },
              hourOfDay: { type: "integer" },
              traveledAt: { type: ["string", "null"] },
              pathfindingResult: { type: ["object", "null"], additionalProperties: true },
            },
          },
        },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export const saveUserTravelHistorySchema = {
  tags: ["Navigation"],
  summary: "Save a completed user route to travel history",
  operationId: "saveUserTravelHistory",
  body: {
    type: "object",
    required: ["routeResult"],
    additionalProperties: false,
    properties: {
      routeResult: { type: "object", additionalProperties: true },
      startedAt: { type: "string" },
      finishedAt: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export const deleteUserTravelHistorySchema = {
  tags: ["Navigation"],
  summary: "Delete one travel history item for current user",
  operationId: "deleteUserTravelHistory",
  querystring: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    404: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export const getRoutingPreferencesSchema = {
  tags: ["Navigation"],
  summary: "Get current user routing preferences",
  operationId: "getRoutingPreferences",
  response: {
    200: {
      type: "object",
      properties: {
        preferences: {
          type: "object",
          required: ["speed", "crowding", "price", "transfer", "walking"],
          properties: {
            speed: { type: "number" },
            crowding: { type: "number" },
            price: { type: "number" },
            transfer: { type: "number" },
            walking: { type: "number" },
          },
        },
        options: {
          type: "object",
          required: [
            "maxWalkingDistanceM",
            "maxTotalWalkingDistanceM",
            "maxWalkingNeighbors",
            "maxBusTransfers",
            "walkingSpeedMps",
          ],
          properties: {
            maxWalkingDistanceM: { type: "number" },
            maxTotalWalkingDistanceM: { type: "number" },
            maxWalkingNeighbors: { type: "integer" },
            maxBusTransfers: { type: "integer" },
            walkingSpeedMps: { type: "number" },
          },
        },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export const setRoutingPreferencesSchema = {
  tags: ["Navigation"],
  summary: "Set current user routing preferences",
  operationId: "setRoutingPreferences",
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      preferences: {
        type: "object",
        additionalProperties: false,
        properties: {
          speed: { type: "number", minimum: 0 },
          crowding: { type: "number", minimum: 0 },
          price: { type: "number", minimum: 0 },
          transfer: { type: "number", minimum: 0 },
          walking: { type: "number", minimum: 0 },
        },
      },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxWalkingDistanceM: { type: "number", minimum: 50 },
          maxTotalWalkingDistanceM: { type: "number", minimum: 0, maximum: 10000 },
          maxWalkingNeighbors: { type: "integer", minimum: 1, maximum: 100 },
          maxBusTransfers: { type: "integer", minimum: 0, maximum: 10 },
          walkingSpeedMps: { type: "number", minimum: 0.4, maximum: 3.5 },
        },
      },
    },
    anyOf: [
      { required: ["preferences"] },
      { required: ["options"] },
    ],
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        preferences: {
          type: "object",
          properties: {
            speed: { type: "number" },
            crowding: { type: "number" },
            price: { type: "number" },
            transfer: { type: "number" },
            walking: { type: "number" },
          },
        },
        options: {
          type: "object",
          properties: {
            maxWalkingDistanceM: { type: "number" },
            maxTotalWalkingDistanceM: { type: "number" },
            maxWalkingNeighbors: { type: "integer" },
            maxBusTransfers: { type: "integer" },
            walkingSpeedMps: { type: "number" },
          },
        },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};
