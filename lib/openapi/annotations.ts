import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const ANNOTATIONS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/annotations": {
    post: {
      tags: ["Annotations"],
      summary: "Add human annotation to span",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                spanId: { type: "string" },
                name: { type: "string" },
                label: { type: "string" },
                score: { type: "number" },
                explanation: { type: "string" },
              },
              required: ["spanId", "name", "label"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Annotation saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
