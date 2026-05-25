import type { OpenAPIV3_1 } from "openapi-types";
import { AUTH_PATHS } from "./auth";
import { THREADS_PATHS } from "./threads";
import { PROVIDERS_PATHS } from "./providers";
import { ANNOTATIONS_PATHS } from "./annotations";
import { EVALS_PATHS } from "./evals";
import { DATASETS_PATHS } from "./datasets";
import { AGENTS_PATHS } from "./agents";
import { SETTINGS_PATHS } from "./settings";
import { OBSERVABILITY_PATHS } from "./observability";

export { ERROR_SCHEMAS } from "./error-schemas";

export const MY_PHENIX_INFO: OpenAPIV3_1.InfoObject = {
  title: "My Own Phenix API",
  version: "1.0.0",
  description: "Unified API for LLM observability, evaluation, and chat — powered by Arize Phoenix",
};

export const SECURITY_SCHEMES: OpenAPIV3_1.ComponentsObject["securitySchemes"] = {
  BearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Firebase ID Token",
  },
};

export const MY_PHENIX_PATHS: OpenAPIV3_1.PathsObject = {
  ...AUTH_PATHS,
  ...THREADS_PATHS,
  ...PROVIDERS_PATHS,
  ...ANNOTATIONS_PATHS,
  ...EVALS_PATHS,
  ...DATASETS_PATHS,
  ...AGENTS_PATHS,
  ...SETTINGS_PATHS,
  ...OBSERVABILITY_PATHS,
};
