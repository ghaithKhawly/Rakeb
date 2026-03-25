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
  summary: "Compute best route",
  operationId: "computeNavigationRoute",
  body: {
    type: "object",
    required: ["from", "to"],
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
          maxWalkingDistanceM: { type: "number", minimum: 50, maximum: 2000 },
          maxWalkingNeighbors: { type: "integer", minimum: 1, maximum: 100 },
          walkingSpeedMps: { type: "number", minimum: 0.4, maximum: 3.5 },
        },
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: [
        "message",
        "executedInWorker",
        "graphLoadedAt",
        "from",
        "to",
        "totalCost",
        "components",
        "transferCount",
        "walkingDistanceM",
        "etaSeconds",
        "segments",
        "usedConfig",
      ],
      properties: {
        message: { type: "string" },
        executedInWorker: { type: "boolean" },
        graphLoadedAt: { type: ["string", "null"] },
        from: locationSchema,
        to: locationSchema,
        totalCost: { type: "number" },
        components: {
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
        transferCount: { type: "integer" },
        walkingDistanceM: { type: "number" },
        etaSeconds: { type: "number" },
        segments: {
          type: "array",
          items: {
            type: "object",
            required: ["mode", "routeId", "routeName", "from", "to", "distanceM", "timeSeconds", "cost"],
            properties: {
              mode: { type: "string", enum: ["walk", "bus"] },
              routeId: { type: ["integer", "null"] },
              routeName: { type: ["string", "null"] },
              from: locationSchema,
              to: locationSchema,
              distanceM: { type: "number" },
              timeSeconds: { type: "number" },
              cost: { type: "number" },
            },
          },
        },
        usedConfig: {
          type: "object",
          required: ["weights", "maxWalkingDistanceM", "maxWalkingNeighbors", "walkingSpeedMps"],
          properties: {
            weights: {
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
            maxWalkingDistanceM: { type: "number" },
            maxWalkingNeighbors: { type: "integer" },
            walkingSpeedMps: { type: "number" },
          },
        },
      },
    },
    401: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
      },
    },
  },
};