import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const DATASETS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/datasets": {
    get: {
      tags: ["Datasets"],
      summary: "List datasets",
      responses: {
        "200": {
          description: "Dataset list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { type: "object" } },
                  nextCursor: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Datasets"],
      summary: "Create dataset",
      responses: {
        "200": { description: "Dataset created" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update dataset",
      responses: {
        "200": { description: "Dataset updated" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete dataset",
      responses: {
        "200": { description: "Dataset deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/datasets/rows": {
    get: {
      tags: ["Datasets"],
      summary: "Get dataset rows (paginated)",
      responses: {
        "200": { description: "Row list" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Datasets"],
      summary: "Add rows to dataset",
      responses: {
        "200": { description: "Rows added" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update row",
      responses: {
        "200": { description: "Row updated" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete rows",
      responses: {
        "200": { description: "Rows deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/datasets/runs": {
    get: {
      tags: ["Datasets"],
      summary: "List dataset runs",
      responses: {
        "200": {
          description: "Run list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { type: "object" } },
                  nextCursor: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Datasets"],
      summary: "Create dataset run",
      responses: {
        "200": { description: "Run created" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/datasets/runs/{runId}": {
    get: {
      tags: ["Datasets"],
      summary: "Get run with results",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Run details" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update run",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Run updated" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete run",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Run deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/datasets/runs/{runId}/export": {
    get: {
      tags: ["Datasets"],
      summary: "Export run results as CSV",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "CSV file" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
