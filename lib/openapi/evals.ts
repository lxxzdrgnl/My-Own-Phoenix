import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const EVALS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/eval-prompts": {
    get: {
      tags: ["Evaluations"],
      summary: "List eval prompts",
      responses: {
        "200": { description: "Eval prompt list" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Create or update eval prompt",
      responses: {
        "200": { description: "Eval prompt saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Evaluations"],
      summary: "Delete eval prompt",
      responses: {
        "200": { description: "Eval prompt deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/eval-backfill": {
    post: {
      tags: ["Evaluations"],
      summary: "Run eval backfill on date range",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                evalName: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
              },
              required: ["projectId", "evalName", "startDate", "endDate"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Backfill results" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/eval-config": {
    get: {
      tags: ["Evaluations"],
      summary: "Get project eval config",
      parameters: [{ name: "projectId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Eval config list" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Update project eval config",
      responses: {
        "200": { description: "Config updated" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
