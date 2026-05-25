import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const AGENTS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/agent-config": {
    get: {
      tags: ["Agents"],
      summary: "List project-agent configs",
      responses: {
        "200": {
          description: "Config list",
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
    put: {
      tags: ["Agents"],
      summary: "Upsert project-agent config",
      responses: {
        "200": { description: "Config saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Agents"],
      summary: "Delete project-agent config",
      responses: {
        "200": { description: "Config deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/agent-templates": {
    get: {
      tags: ["Agents"],
      summary: "List agent templates",
      responses: {
        "200": {
          description: "Template list",
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
      tags: ["Agents"],
      summary: "Create agent template",
      responses: {
        "200": { description: "Template created" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Agents"],
      summary: "Update agent template",
      responses: {
        "200": { description: "Template updated" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Agents"],
      summary: "Delete agent template",
      responses: {
        "200": { description: "Template deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
