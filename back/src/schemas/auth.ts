export const registerSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    additionalProperties: false,
    properties: {
      username: { type: "string", minLength: 3, maxLength: 50 },
      password: { type: "string", minLength: 6, maxLength: 100 }
    }
  },
  response: {
    201: {
      type: "object",
      properties: {
        message: { type: "string" },
        userId: { type: "number" },
        role: { type: "string" },
        token: { type: "string" }
      }
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    },
    500: {
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
    additionalProperties: false,
    properties: {
      username: { type: "string", minLength: 3, maxLength: 50 },
      password: { type: "string", minLength: 6, maxLength: 100 }
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
            username: { type: "string" },
            role: { type: "string" },
          }
        }
      }
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    }
  }
};

export const changeUserRole = {
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: { type: "integer", minimum: 1 },
      username: { type: "string", minLength: 3, maxLength: 50 },
    },
    oneOf: [
      { required: ["userId"] },
      { required: ["username"] },
    ],
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "number" },
            username: { type: "string" },
            role: { type: "string" },
          },
        },
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
    403: {
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
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};