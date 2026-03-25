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
    created_at: { type: ["string", "null"] },
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
              lastReportAt: { type: ["string", "null"] },
              updatedAt: { type: ["string", "null"] },
            },
          },
        },
      },
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
