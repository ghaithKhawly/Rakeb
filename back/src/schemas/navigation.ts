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
  body: {
    type: "object",
    required: ["from", "to"],
    properties: {
      from: locationSchema,
      to: locationSchema,
    },
  },
};