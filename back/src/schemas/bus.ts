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
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      forceRefresh: { type: "boolean", default: false },
    },
  },
};

export const getGraphSchema = {
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
