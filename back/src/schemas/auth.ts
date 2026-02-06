export const registerSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 3, maxLength: 50 },
      password: { type: "string", minLength: 6 }
    }
  },
  response: {
    201: {
      type: "object",
      properties: {
        message: { type: "string" },
        userId: { type: "number" },
        token: { type: "string" }
      }
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    }
  }
};

export const loginSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string" },
      password: { type: "string" }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        token: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "number" },
            username: { type: "string" }
          }
        }
      }
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    }
  }
};