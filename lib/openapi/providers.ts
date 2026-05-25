import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const PROVIDERS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/providers": {
    get: {
      tags: ["Providers"],
      summary: "List LLM providers",
      parameters: [
        {
          name: "decrypt",
          in: "query",
          schema: { type: "string", enum: ["true"] },
          description: "Return decrypted keys (internal use)",
        },
      ],
      responses: {
        "200": { description: "Provider list with masked API keys" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Providers"],
      summary: "Register LLM provider",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "anthropic", "google", "xai"] },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Provider registered" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/providers/{id}": {
    put: {
      tags: ["Providers"],
      summary: "Update provider API key",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Provider updated" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Providers"],
      summary: "Delete provider",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Provider deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/providers/test": {
    post: {
      tags: ["Providers"],
      summary: "Test provider connection",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string" },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Connection test result" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
