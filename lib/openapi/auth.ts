import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const AUTH_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/auth/sync": {
    post: {
      tags: ["Auth"],
      summary: "Sync user after Firebase login",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                uid: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
              },
              required: ["uid", "email"],
            },
          },
        },
      },
      responses: {
        "200": { description: "User synced" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
