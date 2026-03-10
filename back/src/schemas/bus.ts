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
    },
  },
    response:{
    200: {
      type: "object",
      properties: {message: { type: "string" }},
    },}
}
