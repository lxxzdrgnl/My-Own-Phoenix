import type { OpenAPIV3_1 } from "openapi-types";
import { STANDARD_ERROR_RESPONSES } from "./shared";

export const SETTINGS_PATHS: OpenAPIV3_1.PathsObject = {
  "/api/settings": {
    get: {
      tags: ["Settings"],
      summary: "Get app settings",
      responses: {
        "200": { description: "Settings key-value pairs" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Settings"],
      summary: "Update app settings",
      responses: {
        "200": { description: "Settings saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
};
