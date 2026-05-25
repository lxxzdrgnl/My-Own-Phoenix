import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const THREADS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/user-threads": {
    get: {
      tags: ["Chat"],
      summary: "List chat threads",
      parameters: [
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
        { name: "project", in: "query", schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Thread list" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Chat"],
      summary: "Create chat thread",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                userId: { type: "string" },
                langGraphThreadId: { type: "string" },
                title: { type: "string" },
                project: { type: "string" },
              },
              required: ["userId", "langGraphThreadId"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Thread created" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/user-threads/{id}": {
    delete: {
      tags: ["Chat"],
      summary: "Delete chat thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Thread deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/user-threads/{id}/messages": {
    get: {
      tags: ["Chat"],
      summary: "List messages in thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Message list" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Chat"],
      summary: "Add message to thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                role: { type: "string" },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Message added" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "404": STANDARD_ERROR_RESPONSES["404"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/llm": {
    post: {
      tags: ["Chat"],
      summary: "Call LLM (multi-provider)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string" },
                      content: { type: "string" },
                    },
                  },
                },
                model: { type: "string", default: "gpt-4o-mini" },
                temperature: { type: "number", default: 0.7 },
                promptLabel: { type: "string" },
              },
              required: ["messages"],
            },
          },
        },
      },
      responses: {
        "200": { description: "LLM response (OpenAI-compatible format)" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/feedback": {
    get: {
      tags: ["Chat"],
      summary: "Get message feedback",
      parameters: [
        { name: "messageId", in: "query", required: true, schema: { type: "string" } },
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Feedback value" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    post: {
      tags: ["Chat"],
      summary: "Submit message feedback",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messageId: { type: "string" },
                userId: { type: "string" },
                value: { type: "string", enum: ["up", "down"] },
              },
              required: ["messageId", "userId", "value"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Feedback saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "409": STANDARD_ERROR_RESPONSES["409"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    delete: {
      tags: ["Chat"],
      summary: "Delete message feedback",
      responses: {
        "200": { description: "Feedback deleted" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
