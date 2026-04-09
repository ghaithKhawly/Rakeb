export const locationSchema = {
  type: "object",
  required: ["lat", "lng"],
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
    label: { type: "string" },
  },
};

export const navigationRouteSchema = {
  tags: ["Navigation"],
  summary: "Compute best route from coordinates",
  operationId: "computeNavigationRoute",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["from", "to"],
    additionalProperties: false,
    properties: {
      from: locationSchema,
      to: locationSchema,
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
  },
  response: {
    200: {
      type: "object",
      additionalProperties: true,
    },
    400: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
      },
    },
    401: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
        details: { type: "string" },
      },
    },
    504: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
        details: { type: "string" },
      },
    },
  },
};