import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const OBSERVABILITY_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/dashboard/layout": {
    get: {
      tags: ["Dashboard"],
      summary: "Get the shared dashboard layout for a project",
      parameters: [
        { name: "projectId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "{ layout, lastUpdatedBy, updatedAt, updatedByName }" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Dashboard"],
      summary: "Save the shared dashboard layout (editor+ only)",
      responses: {
        "200": { description: "Layout saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/sse/project/{id}": {
    get: {
      tags: ["Dashboard"],
      summary: "Subscribe to project events (SSE); includes layout-updated messages",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "text/event-stream" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
      },
    },
  },
};
