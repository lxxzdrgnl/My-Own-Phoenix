export const ERROR_SCHEMAS = {
  ApiError: {
    type: "object" as const,
    properties: {
      timestamp: { type: "string" as const, format: "date-time", description: "Error timestamp (ISO 8601)" },
      path: { type: "string" as const, description: "Request path" },
      status: { type: "integer" as const, description: "HTTP status code" },
      code: { type: "string" as const, description: "Internal error code (uppercase+underscore)", example: "VALIDATION_FAILED" },
      message: { type: "string" as const, description: "Human-readable error message" },
      details: { type: "object" as const, description: "Field-level errors or additional context", additionalProperties: true },
    },
    required: ["timestamp", "path", "status", "code", "message"],
  },
};
