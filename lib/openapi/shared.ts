// Shared error responses referenced by all domain path modules

export const STANDARD_ERROR_RESPONSES = {
  "400": { description: "Bad request / Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
  "401": { description: "Unauthorized — missing or invalid auth token", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
  "403": { description: "Forbidden — insufficient permissions", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
  "404": { description: "Resource not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
  "409": { description: "Conflict — duplicate resource", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
  "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
};
